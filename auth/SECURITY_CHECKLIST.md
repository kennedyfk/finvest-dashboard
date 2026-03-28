# Checklist de Segurança — Portal ANS Auth

## ✅ JÁ IMPLEMENTADO

### Autenticação
- [x] Hash de senhas com bcrypt (gerenciado pelo Supabase — argon2id internamente)
- [x] JWT com access token de curta duração (1h padrão Supabase)
- [x] Refresh token automático via SDK
- [x] PKCE flow no OAuth (mais seguro que implicit grant)
- [x] Confirmação de e-mail obrigatória antes do primeiro login
- [x] Senhas com mínimo de 8 caracteres (validação no frontend + backend)
- [x] Indicador visual de força de senha

### Autorização
- [x] 3 níveis de acesso: FREE < PREMIUM < ADMIN
- [x] Verificação de role em toda página protegida via auth-guard.js
- [x] Row Level Security (RLS) no banco — usuário só acessa próprios dados
- [x] Função SQL `set_user_role()` — apenas ADMINs promovem usuários
- [x] Ocultação de elementos por role via `[data-min-role]`

### Proteção de Inputs
- [x] Sanitização de inputs de texto (sanitizeInput remove HTML)
- [x] Limites de tamanho em todos os campos (maxlength)
- [x] Validação de formato de e-mail (frontend + Supabase backend)
- [x] autocomplete attributes corretos nos formulários

### UX de Segurança
- [x] Mensagens de erro genéricas (não revelam se e-mail existe)
- [x] Flash de conteúdo não autorizado prevenido (visibility:hidden)
- [x] Rate limiting nativo do Supabase (brute-force protection)
- [x] Link de recuperação de senha com expiração de 1h
- [x] Logout após redefinição de senha (força novo login)

### OAuth
- [x] PKCE flow ativo para Google e GitHub
- [x] Callback em rota dedicada (/auth/callback.html)
- [x] Perfil criado automaticamente via trigger SQL no primeiro OAuth

---

## ⚠️ CONFIGURAR ANTES DE PRODUÇÃO

### Supabase Dashboard
- [ ] **RLS habilitado** em todas as tabelas (já no schema.sql — confirme)
- [ ] **Email confirmado obrigatório**: Auth → Settings → "Confirm email"
- [ ] **Providers OAuth configurados**: Auth → Providers → Google + GitHub
  - [ ] Adicionar `https://seu-dominio.com.br/auth/callback.html` como Redirect URL
- [ ] **Rate limiting** ajustado: Auth → Settings → Rate Limits
  - Recomendado: max 5 tentativas de login por 15 minutos por IP
- [ ] **SMTP personalizado** configurado (padrão do Supabase tem limite de 3/h)
- [ ] **JWT secret** customizado (Settings → API → JWT Secret)

### Domínio e Infraestrutura
- [ ] **HTTPS obrigatório** em produção (Vercel aplica automaticamente)
- [ ] **Domínio personalizado** configurado no Supabase (Settings → Custom Domain)
- [ ] **CORS** configurado: Supabase → Settings → API → Allowed origins
  - Adicionar apenas domínios confiáveis

### Tokens e Cookies
- [ ] **Avaliar migração para httpOnly cookies** se adicionar SSR (Next.js/Nuxt)
  - Em HTML puro, o SDK usa localStorage — aceitável com HTTPS + CSP
- [ ] **Content Security Policy (CSP)** — adicionar headers no servidor:
  ```
  Content-Security-Policy: default-src 'self';
    script-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com;
    style-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com;
    connect-src 'self' https://*.supabase.co;
    frame-ancestors 'none';
  ```

### Monitoramento
- [ ] **Alertas de login suspeito** — Supabase Auth Hooks → Log de eventos
- [ ] **Monitoramento de tabela `login_attempts`** — consultas periódicas
- [ ] **Logs de auditoria** para alterações de role (tabela `password_reset_log`)

### Conformidade (LGPD)
- [ ] **Política de Privacidade** documentada e linkada nas telas de auth
- [ ] **Termos de Uso** documentados
- [ ] **Direito ao esquecimento**: implementar endpoint para `DELETE` do usuário
  ```sql
  -- Adicionar ao schema: CASCADE na deleção já está configurado
  -- Basta chamar: supabase.auth.admin.deleteUser(userId)
  ```
- [ ] **Log de consentimento** dos Termos de Uso (checkbox com timestamp)

### Testes de Segurança (pré-launch)
- [ ] Testar OWASP Top 10:
  - [ ] SQL Injection → RLS + ORM do Supabase previne
  - [ ] XSS → sanitizeInput + CSP
  - [ ] CSRF → não aplicável (JWT stateless; sem cookies de sessão)
  - [ ] Broken Auth → testar expiração de tokens e refresh
  - [ ] IDOR → testar se usuário A acessa dados do usuário B
- [ ] Testar fluxo completo de recuperação de senha com link expirado
- [ ] Testar brute-force: 6+ tentativas em sequência devem ser bloqueadas
- [ ] Testar acesso direto a páginas protegidas sem sessão

---

## 🚀 CHECKLIST DE DEPLOY (Vercel)

```bash
# 1. Variáveis de ambiente no Vercel Dashboard
#    Settings → Environment Variables
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...

# 2. Ou via CLI
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY

# 3. Redirect URLs no Supabase
#    Authentication → URL Configuration → Redirect URLs
#    Adicionar: https://seu-projeto.vercel.app/auth/callback.html

# 4. Site URL no Supabase
#    Authentication → URL Configuration → Site URL
#    Definir: https://seu-projeto.vercel.app
```

---

## INTEGRAÇÃO NAS PÁGINAS EXISTENTES

Para proteger qualquer página HTML do dashboard, adicione no `<head>`:

```html
<!-- Configuração do ambiente (adicione em cada página) -->
<script src="../js/env.js"></script>

<!-- Supabase SDK -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

<!-- Auth logic -->
<script src="../js/auth.js"></script>

<!-- Guard: redireciona se não autenticado, verifica role -->
<script src="../js/auth-guard.js"
  data-require-auth="true"
  data-require-role="FREE"
></script>
```

Para páginas que exigem PREMIUM:
```html
<script src="../js/auth-guard.js"
  data-require-auth="true"
  data-require-role="PREMIUM"
></script>
```

Para exibir dados do usuário no header:
```html
<span data-auth-name></span>     <!-- nome do usuário -->
<span data-auth-role></span>     <!-- badge: Gratuito / Premium / Admin -->
<span data-auth-email></span>    <!-- email -->
```

Para esconder features por plano:
```html
<!-- Visível apenas para PREMIUM e ADMIN -->
<button data-min-role="PREMIUM">Exportar CSV</button>

<!-- Visível para todos, mas clique bloqueado para FREE (mostra toast) -->
<button data-role-gate="PREMIUM">Exportar PDF</button>
```
