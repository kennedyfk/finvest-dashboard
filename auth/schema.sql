-- ============================================================
-- SCHEMA DE AUTENTICAÇÃO — Portal ANS / Finvest Dashboard
-- Banco: Supabase (PostgreSQL)
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ── 1. ENUM DE ROLES ────────────────────────────────────────
CREATE TYPE public.user_role AS ENUM ('FREE', 'PREMIUM', 'ADMIN');

-- ── 2. TABELA DE PERFIS (extensão do auth.users do Supabase) ─
-- auth.users é gerenciado pelo Supabase; esta tabela armazena
-- metadados customizados e o role do usuário.
CREATE TABLE public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'FREE',
  avatar_url    TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. TABELA DE SESSÕES DE AUDIT ────────────────────────────
-- Rastreia tentativas de login para brute-force protection
CREATE TABLE public.login_attempts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  success       BOOLEAN     NOT NULL,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consulta rápida de tentativas recentes por email
CREATE INDEX idx_login_attempts_email_time
  ON public.login_attempts(email, attempted_at DESC);

-- ── 4. TABELA DE TOKENS DE RECUPERAÇÃO (gerenciado pelo Supabase)
-- O Supabase gerencia os tokens de reset via auth.users.
-- Esta tabela é apenas para audit trail customizado.
CREATE TABLE public.password_reset_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  ip_address    INET
);

-- ── 5. TRIGGER: auto-criar profile após signup ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'FREE'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 6. TRIGGER: atualizar updated_at automaticamente ─────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 7. ROW LEVEL SECURITY (RLS) ──────────────────────────────
-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_log ENABLE ROW LEVEL SECURITY;

-- PROFILES: usuário vê/edita apenas o próprio perfil
CREATE POLICY "Usuário vê próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuário edita próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- ADMIN pode ver e editar todos os perfis
CREATE POLICY "Admin acessa todos os perfis"
  ON public.profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );

-- ── 8. FUNÇÃO: verificar role do usuário ─────────────────────
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID DEFAULT auth.uid())
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;

-- ── 9. FUNÇÃO: promover usuário (apenas ADMIN) ───────────────
CREATE OR REPLACE FUNCTION public.set_user_role(
  target_user_id UUID,
  new_role        user_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verifica se quem chama é ADMIN
  IF public.get_user_role(auth.uid()) != 'ADMIN' THEN
    RAISE EXCEPTION 'Acesso negado: somente ADMINs podem alterar roles';
  END IF;

  UPDATE public.profiles
  SET role = new_role
  WHERE id = target_user_id;
END;
$$;

-- ── 10. VIEWS ÚTEIS ──────────────────────────────────────────
-- View para o painel admin: lista todos os usuários com role.
-- Segurança garantida pelo WHERE interno: só retorna dados se o
-- usuário autenticado for ADMIN. Views não aceitam CREATE POLICY.
CREATE OR REPLACE VIEW public.admin_users_view
WITH (security_invoker = true)  -- usa as permissões de quem chama (PostgreSQL 15+)
AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.is_active,
  p.created_at,
  u.last_sign_in_at,
  u.email_confirmed_at IS NOT NULL AS email_verified
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE public.get_user_role() = 'ADMIN';  -- retorna vazio para não-ADMINs
