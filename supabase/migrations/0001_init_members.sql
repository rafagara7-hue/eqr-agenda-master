-- Migration: 0001_init_members
-- Tabela principal de membros (Aluisio, Henrique, Kadu, Wesley + Admin)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.members (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,
  slug          TEXT          NOT NULL UNIQUE,
  color         TEXT          NOT NULL,
  color_hex     TEXT          NOT NULL,
  role          TEXT          NOT NULL DEFAULT 'member'
                CHECK (role IN ('admin', 'member')),
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  avatar_url    TEXT,
  google_linked BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_members_user_id ON public.members(user_id);
CREATE INDEX idx_members_slug ON public.members(slug);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Habilita RLS
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
