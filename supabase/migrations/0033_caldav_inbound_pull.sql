-- Migration: 0033_caldav_inbound_pull
--
-- Habilita pull completo de events do Apple Calendar (via CalDAV) para o EQR.
-- Eventos pessoais que sócio cria no Apple Calendar passam a ser refletidos no
-- EQR pra admin ter visibilidade total do que está agendado.
--
-- Decisões de design:
--   1. Reusa external_provider/external_event_id (consistente com Google/MS)
--      em vez de criar coluna apple_sourced. Apenas amplia o CHECK.
--   2. UNIQUE index parcial garante idempotência: pulls repetidos não duplicam.
--   3. Colunas inbound_sync_token/last_inbound_pull_at em caldav_connections
--      (NÃO em events) porque cursor é por-conexão.
--   4. event_sync_log.source ampliado pra incluir 'caldav' (auditoria inbound).
--   5. Opt-in toggle inbound_sync_enabled (default true — usuário pediu).
--
-- Anti-loop arquitetural (não precisa schema):
--   - pushEventToCaldav SKIP quando event.external_provider='apple_caldav'
--   - pull SKIP UIDs no formato `<uuid>@<host>` (eventos EQR-canônicos)
--   - reverseSyncDeletes filtra .neq('external_provider', 'apple_caldav')

-- ============================================================
-- 1. events.external_provider — adiciona 'apple_caldav'
-- ============================================================

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_external_provider_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_external_provider_check
  CHECK (external_provider IS NULL OR external_provider IN ('google', 'microsoft', 'apple_caldav'));

-- ============================================================
-- 2. UNIQUE index — idempotência pull
-- ============================================================
-- Garante que um VEVENT do Apple (mesmo UID iCloud + mesmo member) só vire 1 row.
-- Pull subsequentes fazem UPSERT, não INSERT duplicado.

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_unique_per_member_caldav
  ON public.events(member_id, external_event_id)
  WHERE external_provider = 'apple_caldav' AND external_event_id IS NOT NULL;

-- ============================================================
-- 3. caldav_connections — cursor + auditoria do inbound
-- ============================================================

ALTER TABLE public.caldav_connections
  ADD COLUMN IF NOT EXISTS inbound_sync_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_inbound_pull_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_inbound_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS inbound_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.caldav_connections.inbound_sync_token IS
  'CalDAV ctag/sync-token do calendar pra pull incremental futuro. V1 não usa (full pull).';
COMMENT ON COLUMN public.caldav_connections.last_inbound_pull_at IS
  'Última vez que rodou pullInboundFromCaldav com sucesso.';
COMMENT ON COLUMN public.caldav_connections.last_inbound_error IS
  'Mensagem do último erro de pull inbound (null se sucesso).';
COMMENT ON COLUMN public.caldav_connections.inbound_sync_enabled IS
  'Toggle pra desabilitar pull inbound por sócio (privacidade). Default TRUE.';

-- ============================================================
-- 4. event_sync_log.source — adiciona 'caldav'
-- ============================================================

ALTER TABLE public.event_sync_log DROP CONSTRAINT IF EXISTS event_sync_log_source_check;
ALTER TABLE public.event_sync_log
  ADD CONSTRAINT event_sync_log_source_check
  CHECK (source IN ('supabase', 'google', 'microsoft', 'n8n', 'caldav'));

-- ============================================================
-- 5. RLS — events_select_own_or_admin (0009) já cobre
-- ============================================================
-- Sócio vê só onde está em participants; admin vê tudo via eqr_is_admin().
-- Eventos Apple-sourced são inseridos com member_id=dono + participants=[dono],
-- então sócio vê os seus, admin vê tudo. Nenhuma policy nova necessária.

-- ============================================================
-- 6. Index pra performance do pull (busca por external_provider)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_events_provider_member
  ON public.events(external_provider, member_id)
  WHERE external_provider IS NOT NULL;
