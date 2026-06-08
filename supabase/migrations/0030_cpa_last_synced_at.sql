-- Migration: 0030_cpa_last_synced_at
-- Adiciona last_synced_at em calendar_provider_accounts pra throttle do lazy sync.
--
-- Contexto: o cron de iCal IN roda a cada 6h, mas a UX pede sync imediato quando
-- alguem abre o calendar/perfil. Lazy sync verifica esse campo — se ultima sync
-- foi >5min atras, dispara nova. Evita hammering do feed remoto.

ALTER TABLE public.calendar_provider_accounts
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.calendar_provider_accounts.last_synced_at IS
  'Quando rodou última tentativa de sync (cron OU lazy). Usado pra throttle do lazy sync no page-load.';

CREATE INDEX IF NOT EXISTS idx_cpa_last_synced_at
  ON public.calendar_provider_accounts(last_synced_at)
  WHERE ical_url IS NOT NULL;
