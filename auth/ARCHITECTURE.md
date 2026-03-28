# Arquitetura de Autenticação — Portal ANS

## Fluxo Completo

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE CADASTRO                            │
└─────────────────────────────────────────────────────────────────────┘

  [Usuário] ──► register.html ──► supabase.auth.signUp()
                                        │
                                        ▼
                              Supabase cria auth.users
                                        │
                                        ▼
                              TRIGGER handle_new_user
                                        │
                                        ▼
                              INSERT profiles (role=FREE)
                                        │
                                        ▼
                              Email de confirmação enviado
                                        │
                              [Usuário clica no link]
                                        │
                                        ▼
                              auth/callback.html processa
                                        │
                                        ▼
                              Redireciona para index.html ✓


┌─────────────────────────────────────────────────────────────────────┐
│                         FLUXO DE LOGIN                              │
└─────────────────────────────────────────────────────────────────────┘

  [Usuário] ──► login.html
                    │
                    ├── Verifica brute-force (≥5 tentativas/15min → bloqueia)
                    │
                    ▼
            supabase.auth.signInWithPassword()
                    │
              ┌─────┴──────┐
              │ FALHA       │ SUCESSO
              ▼             ▼
          Registra     Supabase retorna:
          tentativa    ├── access_token  (JWT, expira em 1h)
          no banco     └── refresh_token (expira em 7 dias)
                            │
                       Supabase SDK armazena tokens
                       em localStorage (padrão) ou
                       configura para cookies httpOnly
                       via SSR helpers
                            │
                            ▼
                       auth-guard.js lê role do profile
                            │
                            ▼
                       Redireciona para index.html ✓


┌─────────────────────────────────────────────────────────────────────┐
│                      FLUXO DE REFRESH TOKEN                         │
└─────────────────────────────────────────────────────────────────────┘

  [Página carrega] ──► auth-guard.js
                            │
                            ▼
                   supabase.auth.getSession()
                            │
                    ┌───────┴────────┐
                    │ Token válido    │ Token expirado
                    ▼                ▼
               Carrega página   supabase.auth.refreshSession()
                                        │
                                 ┌──────┴──────┐
                                 │ OK           │ FALHA
                                 ▼              ▼
                            Novo token     Redireciona para
                            armazenado     login.html


┌─────────────────────────────────────────────────────────────────────┐
│                      FLUXO DE ACESSO POR ROLE                       │
└─────────────────────────────────────────────────────────────────────┘

  [auth-guard.js executa em cada página protegida]
                    │
                    ▼
        getSession() → busca profile.role
                    │
          ┌─────────┼──────────┐
          │         │          │
         FREE    PREMIUM     ADMIN
          │         │          │
          ▼         ▼          ▼
       Acesso     Acesso     Acesso
       limitado   completo   total +
       sem export            gestão de
                             usuários

  HIERARQUIA DE PERMISSÕES:
  FREE    → dashboards básicos, sem exportação, sem filtros avançados
  PREMIUM → tudo do FREE + exportação CSV/PDF, filtros avançados
  ADMIN   → tudo do PREMIUM + /admin/users.html, alterar roles


┌─────────────────────────────────────────────────────────────────────┐
│                    FLUXO OAUTH (Google / GitHub)                    │
└─────────────────────────────────────────────────────────────────────┘

  [Clica "Entrar com Google"] ──► supabase.auth.signInWithOAuth()
                                          │
                                          ▼
                                  Redireciona para
                                  accounts.google.com
                                          │
                                  [Usuário autoriza]
                                          │
                                          ▼
                                  Callback: auth/callback.html
                                          │
                                          ▼
                                  Supabase troca code por tokens
                                          │
                                          ▼
                                  TRIGGER cria profile (se novo)
                                          │
                                          ▼
                                  Redireciona para index.html ✓


┌─────────────────────────────────────────────────────────────────────┐
│                   FLUXO DE RECUPERAÇÃO DE SENHA                     │
└─────────────────────────────────────────────────────────────────────┘

  recover.html ──► supabase.auth.resetPasswordForEmail()
                            │
                            ▼
                   Email com link seguro enviado
                   (link expira em 1 hora)
                            │
                   [Usuário clica no link]
                            │
                            ▼
                   auth/callback.html detecta type=recovery
                            │
                            ▼
                   Redireciona para reset-password.html
                            │
                   [Usuário digita nova senha]
                            │
                            ▼
                   supabase.auth.updateUser({ password })
                            │
                            ▼
                   Senha atualizada ✓ → Login automático


┌─────────────────────────────────────────────────────────────────────┐
│                    ESTRUTURA DE ARQUIVOS                            │
└─────────────────────────────────────────────────────────────────────┘

finvest-dashboard/
├── auth/
│   ├── login.html           ← Tela de login
│   ├── register.html        ← Cadastro de novo usuário
│   ├── recover.html         ← Solicitar recuperação de senha
│   ├── reset-password.html  ← Redefinir senha (via token)
│   ├── callback.html        ← Handler OAuth + magic links
│   └── schema.sql           ← Schema do banco de dados
├── js/
│   ├── auth.js              ← Lógica de auth (Supabase SDK)
│   └── auth-guard.js        ← Middleware de proteção de rotas
├── css/
│   └── auth.css             ← Estilos das telas de auth
├── .env.example             ← Variáveis de ambiente necessárias
└── index.html               ← Dashboard (protegido por auth-guard)
```
