/**
 * auth-guard.js — Proteção de rotas por role
 * Portal ANS / Finvest Dashboard
 *
 * COMO USAR:
 * Adicione esta tag em cada página protegida, ANTES de qualquer outro script:
 *
 *   <script src="../js/auth-guard.js"
 *     data-require-auth="true"
 *     data-require-role="FREE"
 *   ></script>
 *
 * Atributos disponíveis:
 *   data-require-auth  : "true" → redireciona para login se não autenticado
 *   data-require-role  : "FREE" | "PREMIUM" | "ADMIN"
 *                        O usuário precisa ter ao menos este nível de acesso.
 *                        FREE < PREMIUM < ADMIN
 *
 * Efeitos:
 *   1. Oculta o <body> até verificar a sessão (evita flash de conteúdo)
 *   2. Redireciona para login se não autenticado
 *   3. Redireciona para /auth/unauthorized.html se role insuficiente
 *   4. Injeta dados do perfil em window.__authProfile
 *   5. Injeta badges de role e nome do usuário nos elementos com
 *      [data-auth-role], [data-auth-name], [data-auth-email]
 */

'use strict';

(async () => {
  // Oculta body imediatamente para evitar flash de conteúdo não autorizado
  document.documentElement.style.visibility = 'hidden';

  // ── Lê configuração do script tag ───────────────────────────────────────────
  const scriptEl      = document.currentScript;
  const requireAuth   = scriptEl?.dataset?.requireAuth   !== 'false';
  const requireRole   = (scriptEl?.dataset?.requireRole  || 'FREE').toUpperCase();
  const loginUrl      = '/auth/login.html';
  const unauthorizedUrl = '/auth/unauthorized.html';

  // Aguarda Supabase SDK e AuthModule estarem prontos
  // (auth-guard deve ser carregado DEPOIS do Supabase SDK e auth.js)
  await waitForAuthModule();

  const { supabase, ROLE_LEVEL, getProfile } = window.AuthModule;

  try {
    // ── Obtém sessão ─────────────────────────────────────────────────────────
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      if (requireAuth) {
        redirectToLogin();
        return;
      }
      // Página pública: apenas exibe
      revealPage();
      return;
    }

    // ── Obtém perfil e role ──────────────────────────────────────────────────
    let profile = await getProfile();

    if (!profile) {
      // Sessão válida mas sem perfil (trigger não rodou ou erro no DB).
      // Garante o perfil na tabela e usa fallback local para não travar.
      await ensureProfile(session);
      profile = await getProfile();
    }

    if (!profile) {
      // Ainda sem perfil após garantir — usa fallback mínimo para não redirecionar.
      profile = {
        id:        session.user.id,
        email:     session.user.email,
        full_name: session.user.user_metadata?.full_name || null,
        role:      'FREE',
      };
    }

    // Armazena no window para uso em outros scripts da página
    window.__authProfile = profile;

    // ── Verifica nível de acesso ─────────────────────────────────────────────
    const userLevel     = ROLE_LEVEL[profile.role]    || 0;
    const requiredLevel = ROLE_LEVEL[requireRole]     || 1;

    if (userLevel < requiredLevel) {
      redirectToUnauthorized(profile.role, requireRole);
      return;
    }

    // ── Injeta dados do usuário na UI ────────────────────────────────────────
    // O sidebar é carregado de forma assíncrona — aguarda os elementos aparecerem
    injectWhenReady(profile);

    // ── Aplica restrições de UI por role ────────────────────────────────────
    applyRoleRestrictions(profile.role);

    revealPage();

  } catch (err) {
    console.error('[auth-guard] Erro inesperado:', err);
    // Em caso de erro crítico, redireciona para login para segurança
    redirectToLogin();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FUNÇÕES INTERNAS
  // ─────────────────────────────────────────────────────────────────────────

  function revealPage() {
    document.documentElement.style.visibility = '';
  }

  function redirectToLogin() {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`${loginUrl}?returnTo=${returnTo}`);
  }

  function redirectToUnauthorized(currentRole, requiredRole) {
    revealPage(); // mostra brevemente antes de redirecionar
    window.location.replace(`${unauthorizedUrl}?role=${currentRole}&required=${requiredRole}`);
  }

  /**
   * Aguarda window.AuthModule estar disponível (carregamento assíncrono).
   */
  function waitForAuthModule(maxWaitMs = 5000) {
    return new Promise((resolve, reject) => {
      if (window.AuthModule) { resolve(); return; }

      const start    = Date.now();
      const interval = setInterval(() => {
        if (window.AuthModule) { clearInterval(interval); resolve(); return; }
        if (Date.now() - start > maxWaitMs) {
          clearInterval(interval);
          reject(new Error('AuthModule não carregou a tempo.'));
        }
      }, 50);
    });
  }

  /**
   * Aguarda os elementos do sidebar aparecerem no DOM e então injeta.
   * Necessário porque o sidebar é carregado de forma assíncrona após o auth-guard.
   */
  function injectWhenReady(profile, maxAttempts = 60) {
    let attempts = 0;
    const tryInject = () => {
      if (document.querySelector('[data-auth-name]')) {
        injectAuthUI(profile);
        initSidebarDropdown();
        return;
      }
      if (++attempts < maxAttempts) {
        setTimeout(tryInject, 100);
      }
    };
    tryInject();
  }

  /**
   * Inicializa o dropdown do usuário no sidebar (cobre páginas que não usam sidebar.js).
   * Seguro chamar múltiplas vezes — usa flag para não duplicar listeners.
   */
  function initSidebarDropdown() {
    const menuBtn  = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!menuBtn || menuBtn._dropdownInit) return;
    menuBtn._dropdownInit = true;

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown?.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!dropdown?.contains(e.target) && e.target !== menuBtn) {
        dropdown?.classList.remove('open');
      }
    });

    logoutBtn?.addEventListener('click', async () => {
      dropdown?.classList.remove('open');
      if (window.AuthModule) {
        await window.AuthModule.logout('/auth/login.html');
      } else {
        window.location.href = '/auth/login.html';
      }
    });
  }

  /**
   * Injeta informações do usuário em elementos com data attributes:
   *   [data-auth-name]   → nome completo
   *   [data-auth-email]  → email
   *   [data-auth-role]   → badge com o role atual
   *   [data-auth-avatar] → iniciais ou avatar
   */
  function injectAuthUI(profile) {
    const name     = profile.full_name || profile.email?.split('@')[0] || '';
    const email    = profile.email || '';
    const role     = profile.role || 'FREE';
    const roleLabels = { FREE: 'Gratuito', PREMIUM: 'Premium', ADMIN: 'Admin' };
    const initials = name.split(' ').map(p => p[0]).filter(Boolean).join('').substring(0, 2).toUpperCase() || '?';

    document.querySelectorAll('[data-auth-name]').forEach(el => {
      el.textContent = name;
    });

    document.querySelectorAll('[data-auth-email]').forEach(el => {
      el.textContent = email;
    });

    document.querySelectorAll('[data-auth-role]').forEach(el => {
      el.textContent = roleLabels[role] || role;
      el.className   = `user-role-badge plan-badge ${role.toLowerCase()}`;
    });

    document.querySelectorAll('[data-auth-avatar]').forEach(el => {
      if (profile.avatar_url) {
        if (el.tagName === 'IMG') {
          el.src = profile.avatar_url;
        } else {
          el.style.backgroundImage = `url(${profile.avatar_url})`;
          el.style.backgroundSize  = 'cover';
          el.textContent = '';
        }
      } else {
        if (el.tagName === 'IMG') {
          el.alt = initials;
        } else {
          el.textContent = initials;
        }
      }
    });
  }

  /**
   * Esconde/desabilita elementos por role usando data attributes:
   *   [data-min-role="PREMIUM"] → oculto para FREE
   *   [data-min-role="ADMIN"]   → oculto para FREE e PREMIUM
   *   [data-role-gate]          → adiciona overlay de upgrade
   */
  function applyRoleRestrictions(userRole) {
    const userLevel = ROLE_LEVEL[userRole] || 0;

    // Oculta elementos que exigem role superior
    document.querySelectorAll('[data-min-role]').forEach(el => {
      const minRole = el.dataset.minRole?.toUpperCase();
      const minLevel = ROLE_LEVEL[minRole] || 1;

      if (userLevel < minLevel) {
        el.style.display = 'none';
      }
    });

    // Adiciona overlay de "upgrade" em botões bloqueados
    document.querySelectorAll('[data-role-gate]').forEach(el => {
      const gateRole = el.dataset.roleGate?.toUpperCase();
      const gateLevel = ROLE_LEVEL[gateRole] || 1;

      if (userLevel < gateLevel) {
        el.setAttribute('disabled', 'true');
        el.setAttribute('aria-disabled', 'true');
        el.title = `Disponível no plano ${gateRole}`;
        el.style.position = 'relative';
        el.style.opacity  = '0.5';
        el.style.cursor   = 'not-allowed';

        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showUpgradeToast(gateRole);
        });
      }
    });
  }

  /**
   * Cria o perfil na tabela profiles se ele ainda não existir.
   * Necessário quando o trigger handle_new_user não rodou (ex: OAuth na primeira vez).
   */
  async function ensureProfile(session) {
    try {
      await supabase.from('profiles').upsert({
        id:        session.user.id,
        email:     session.user.email,
        full_name: session.user.user_metadata?.full_name || null,
        role:      'FREE',
      }, { onConflict: 'id', ignoreDuplicates: true });
    } catch (_) {
      // Ignora erros — fallback local já cobre este caso
    }
  }

  /**
   * Exibe um toast de upgrade de plano.
   */
  function showUpgradeToast(requiredRole) {
    const existing = document.getElementById('upgrade-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'upgrade-toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px;
      background: #262a3c; color: #fff;
      padding: 14px 20px; border-radius: 10px;
      font-family: 'Inter', sans-serif; font-size: .84rem;
      box-shadow: 0 10px 30px rgba(0,0,0,.25);
      z-index: 9999; max-width: 320px; line-height: 1.5;
      animation: slideIn 0.3s cubic-bezier(0.4,0,0.2,1);
    `;

    const label = requiredRole === 'PREMIUM' ? 'Premium' : 'Admin';
    toast.innerHTML = `
      <strong>Recurso ${label}</strong><br>
      <span style="color:#9ca3af">Faça upgrade para acessar este recurso.</span>
      <button onclick="this.parentElement.remove()" style="
        margin-left:12px; background:none; border:none; color:#f74b4b;
        font-weight:600; cursor:pointer; font-size:.84rem
      ">×</button>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
})();
