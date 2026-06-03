-- Migration: 0015_ical_subscription
-- Adiciona suporte a iCal subscription read-only em calendar_provider_accounts.
--
-- Por que: o app suporta 2 métodos de auth pra Outlook Calendar:
--   1. OAuth (Microsoft Graph) — bidirecional, requer app registration + tenant
--   2. iCal subscription URL — read-only, requer só URL pública publicada
--      pelo sócio no Outlook Web (Settings → Calendar → Publish a calendar)
--
-- Como funciona:
--   - Linhas com ical_url IS NOT NULL → método iCal (access_token NULL ok)
--   - Linhas com access_token IS NOT NULL → método OAuth (ical_url NULL ok)
--   - CHECK constraint garante que pelo menos um dos métodos está preenchido

-- ============================================================
-- 1. Torna colunas de OAuth nullable (pra permitir iCal-only rows)
-- ============================================================

ALTER TABLE public.calendar_provider_accounts
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL,
  ALTER COLUMN token_expires_at DROP NOT NULL;

-- ============================================================
-- 2. Adiciona coluna ical_url (TEXT, NULL pra rows OAuth)
-- ============================================================

ALTER TABLE public.calendar_provider_accounts
  ADD COLUMN IF NOT EXISTS ical_url TEXT NULL;

-- Idempotente: comentário pra documentar a coluna
COMMENT ON COLUMN public.calendar_provider_accounts.ical_url IS
  'URL iCal pública do Outlook publicado pelo sócio. Quando NOT NULL, conta usa sync read-only via fetch de iCal em vez de OAuth Graph API.';

-- ============================================================
-- 3. CHECK constraint: garante que pelo menos UM método de auth está completo
-- ============================================================

ALTER TABLE public.calendar_provider_accounts
  DROP CONSTRAINT IF EXISTS chk_auth_method_present;

ALTER TABLE public.calendar_provider_accounts
  ADD CONSTRAINT chk_auth_method_present CHECK (
    ical_url IS NOT NULL
    OR (
      access_token IS NOT NULL
      AND refresh_token IS NOT NULL
      AND token_expires_at IS NOT NULL
    )
  );

-- ============================================================
-- 4. Índice em ical_url pra cron query (busca rows ical pra sync)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cpa_ical_url
  ON public.calendar_provider_accounts(ical_url)
  WHERE ical_url IS NOT NULL;
