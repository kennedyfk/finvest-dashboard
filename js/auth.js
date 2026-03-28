/**
 * auth.js — Lógica central de autenticação
 * Portal ANS / Finvest Dashboard
 *
 * Depende do Supabase JS SDK v2 carregado via CDN antes deste script.
 * Exporta o objeto global `AuthModule` consumido pelas telas de auth.
 */

'use strict';

// ── Configuração do Supabase ───────────────────────────────────────────────────
// Em produção, substitua pelas variáveis do seu ambiente.
// Em HTML puro (sem bundler), lemos de uma config inline ou de um meta tag.
const SUPABASE_URL = (
  document.querySelector('meta[name="supabase-url"]')?.content ||
  window.__ENV?.SUPABASE_URL ||
  'https://SEU_PROJECT_ID.supabase.co'           // ← substitua
);

const SUPABASE_ANON_KEY = (
  document.querySelector('meta[name="supabase-anon-key"]')?.content ||
  window.__ENV?.SUPABASE_ANON_KEY ||
  'SUA_ANON_KEY_AQUI'                             // ← substitua
);

// Inicializa o cliente Supabase.
// cookieStorage garante que os tokens fiquem em cookies (mais seguro que localStorage)
// quando há servidor SSR; em HTML puro, o SDK usa localStorage por padrão.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,           // renova access_token automaticamente
    persistSession: true,             // mantém sessão entre reloads
    detectSessionInUrl: true,         // captura tokens no hash (OAuth / magic link)
    flowType: 'pkce',                 // PKCE flow — mais seguro que implicit
  }
});

// ── Constantes de roles ────────────────────────────────────────────────────────
const ROLES = Object.freeze({ FREE: 'FREE', PREMIUM: 'PREMIUM', ADMIN: 'ADMIN' });

// ── Hierarquia de permissões ───────────────────────────────────────────────────
// Usado para verificar "tem no mínimo este nível"
const ROLE_LEVEL = Object.freeze({ FREE: 1, PREMIUM: 2, ADMIN: 3 });

// ── Rotas padrão por role ──────────────────────────────────────────────────────
const ROLE_DEFAULT_ROUTE = Object.freeze({
  FREE:    '../index.html',
  PREMIUM: '../index.html',
  ADMIN:   '../index.html',           // customize para /admin se quiser
});

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS DE UI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exibe ou oculta o alerta global na tela de auth.
 * @param {string} message - Texto da mensagem
 * @param {'error'|'success'|'warning'|'info'|''} type - Tipo do alerta
 */
function showAlert(message, type) {
  const el  = document.getElementById('globalAlert');
  const msg = document.getElementById('globalAlertMsg');
  if (!el || !msg) return;

  if (!message || !type) {
    el.className = 'auth-alert';
    el.classList.remove('show');
    return;
  }

  msg.textContent = message;
  el.className = `auth-alert ${type} show`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Alterna o estado de loading do botão de submit.
 * @param {HTMLButtonElement} btn
 * @param {HTMLElement} textEl - Elemento span dentro do botão
 * @param {boolean} loading
 * @param {string} [defaultText]
 */
function setLoading(btn, textEl, loading, defaultText = '') {
  if (loading) {
    btn.disabled = true;
    textEl.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    textEl.textContent = defaultText;
  }
}

/**
 * Sanitiza input de texto removendo tags HTML.
 * NÃO use em senhas.
 * @param {string} input
 * @returns {string}
 */
function sanitizeInput(input) {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML
    .replace(/&amp;/g, '&')
    .trim()
    .substring(0, 500); // limite de segurança
}

/**
 * Calcula a força de uma senha.
 * @param {string} password
 * @returns {{ score: 1|2|3|4, label: string, color: string }}
 */
function checkPasswordStrength(password) {
  let score = 0;

  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  // Mapeia para 1-4 barras
  const normalized = Math.min(Math.ceil(score * 4 / 5), 4) || 1;

  const labels = ['', 'Fraca', 'Regular', 'Boa', 'Forte'];
  const colors = ['', 'weak', 'fair', 'good', 'strong'];

  return { score: normalized, label: labels[normalized], color: colors[normalized] };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICAÇÃO: EMAIL / SENHA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registra um novo usuário com email e senha.
 * O Supabase envia e-mail de confirmação automaticamente.
 */
async function register({ email, password, fullName }) {
  const { data, error } = await supabaseClient.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { full_name: sanitizeInput(fullName) },
      emailRedirectTo: `${window.location.origin}/auth/callback.html`,
    }
  });

  if (error) throw error;
  return data;
}

/**
 * Autentica um usuário com email e senha.
 * Brute-force protection é feita no backend (Supabase rate limits).
 * Para rastreamento extra, chamamos a Edge Function de log.
 */
async function login({ email, password }) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Encerra a sessão do usuário.
 * Limpa tokens locais e redireciona para login.
 */
async function logout(redirectTo = '/auth/login.html') {
  await supabaseClient.auth.signOut();
  window.location.href = redirectTo;
}

/**
 * Solicita e-mail de recuperação de senha.
 * Sempre retorna sem indicar se o e-mail existe (segurança).
 */
async function requestPasswordReset(email) {
  const { error } = await supabaseClient.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${window.location.origin}/auth/reset-password.html` }
  );

  // Lança erro apenas para problemas de rate limit, não para "email não encontrado"
  if (error && error.status !== 422) throw error;
}

/**
 * Atualiza a senha do usuário autenticado via token de recovery.
 */
async function resetPassword(newPassword) {
  const { data, error } = await supabaseClient.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTENTICAÇÃO: OAUTH (GOOGLE / GITHUB)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inicia o fluxo OAuth com o provedor indicado.
 * O usuário é redirecionado para a página do provedor.
 * Após autorizar, retorna para /auth/callback.html.
 *
 * @param {'google'|'github'} provider
 */
async function signInWithProvider(provider) {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback.html`,
      scopes: provider === 'github' ? 'read:user user:email' : 'email profile',
    }
  });

  if (error) {
    showAlert(`Erro ao conectar com ${provider === 'google' ? 'Google' : 'GitHub'}. Tente novamente.`, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSÃO E ROLES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna a sessão atual (null se não autenticado).
 * O SDK renova o access_token automaticamente se estiver expirado.
 */
async function getSession() {
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) return null;
  return session;
}

/**
 * Busca o role do usuário atual na tabela `profiles`.
 * @returns {Promise<'FREE'|'PREMIUM'|'ADMIN'|null>}
 */
async function getUserRole() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (error || !data) return null;
  return data.role;
}

/**
 * Verifica se o usuário tem ao menos o nível de role indicado.
 * @param {'FREE'|'PREMIUM'|'ADMIN'} requiredRole
 */
async function hasRole(requiredRole) {
  const role = await getUserRole();
  if (!role) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[requiredRole];
}

/**
 * Retorna dados completos do perfil do usuário autenticado.
 */
async function getProfile() {
  const session = await getSession();
  if (!session) return null;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !data) return null;

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTENER DE MUDANÇA DE SESSÃO
// Útil para exibir/esconder elementos na UI quando a sessão muda
// ─────────────────────────────────────────────────────────────────────────────
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // Garante que sessão stale não persiste
    window._authSession = null;
  }
  if (event === 'TOKEN_REFRESHED') {
    window._authSession = session;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT GLOBAL
// ─────────────────────────────────────────────────────────────────────────────
window.AuthModule = {
  // Supabase client (para uso direto nas telas quando necessário)
  supabase: supabaseClient,

  // Roles e utilitários
  ROLES,
  ROLE_LEVEL,

  // UI helpers
  showAlert,
  setLoading,
  sanitizeInput,
  checkPasswordStrength,

  // Auth functions
  register,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  signInWithProvider,

  // Session / roles
  getSession,
  getUserRole,
  hasRole,
  getProfile,
};
