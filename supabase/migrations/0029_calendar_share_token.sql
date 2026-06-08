-- Migration: 0029_calendar_share_token
-- Adiciona suporte a Subscription URL por member.
--
-- Como funciona:
--   - Cada member pode ter um token aleatório que vira URL pública .ics
--   - URL: https://<host>/api/calendar/<token>.ics
--   - Calendar apps (Google/Apple/Outlook) puxam a URL periodicamente (30min-24h)
--     e mostram os eventos do member como subscription read-only
--   - calendar_share_token NULL = share desabilitado pro member
--   - Endpoint público (sem auth) valida token e retorna VCALENDAR
--
-- Por que existe esse fluxo:
--   - Sócios usam emails fora do Microsoft 365 (eqr.com.br em meuemail.net.br)
--   - OAuth pra sincronizar Outlook não funciona pra eles
--   - Subscription URL é universal — funciona em qualquer calendar app sem auth

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS calendar_share_token TEXT UNIQUE;

COMMENT ON COLUMN public.members.calendar_share_token IS
  'Token aleatório que autoriza acesso público ao endpoint /api/calendar/<token>.ics. NULL = share desabilitado. Regenerar revoga URLs antigas.';

-- Índice pro lookup do endpoint público (busca member pelo token)
CREATE INDEX IF NOT EXISTS idx_members_calendar_share_token
  ON public.members(calendar_share_token)
  WHERE calendar_share_token IS NOT NULL;
