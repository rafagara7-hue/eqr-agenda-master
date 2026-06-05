-- Migration: 0016_meeting_hub_schema
--
-- EQR Meeting Hub: solicitacoes de reuniao reguladas
--
-- Funcionarios criam pedidos -> admin OU socio destinatario aprovam.
-- Aprovacao insere row em events (que dispara N8N outbound sync existente).
--
-- TABELAS NOVAS:
--   public.meeting_requests              (entidade principal)
--   public.meeting_request_participants  (participantes extras alem do target)
--   public.meeting_request_events        (audit append-only)
--   public.meeting_request_comments      (comentarios opcionais)
--   public.partner_office_hours          (horarios em que socio aceita)
--
-- VIEW NOVA:
--   public.v_availability_busy_slots     (busy slots sem leak de detalhes)
--
-- ALTERACAO EM TABELA EXISTENTE:
--   public.members.role: adiciona 'employee' ao CHECK constraint
--
-- REVERSAO:
--   Ver 0016_meeting_hub_schema_DOWN.sql (DROP tables + ALTER role CHECK back).
--
-- DEPENDE DE:
--   * public.handle_updated_at() (definida em 0001)
--   * public.events (0002), public.event_participants (0010)
--   * public.members.role CHECK constraint
--
-- IDEMPOTENTE: usa IF NOT EXISTS onde possivel.

BEGIN;

-- ============================================================
-- 1. members.role: adicionar 'employee'
-- ============================================================

ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE public.members
  ADD CONSTRAINT members_role_check
  CHECK (role IN ('admin', 'member', 'employee'));

COMMENT ON COLUMN public.members.role IS
  'admin = acesso total (Amina) | member = socio (Aluisio/Henrique/Kadu/Wesley) | employee = funcionario (so pode criar meeting_requests, sem acesso direto a events)';

-- ============================================================
-- 2. TABELA meeting_requests (principal)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_requests (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quem pediu e pra quem
  requester_id        UUID         NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  target_partner_id   UUID         NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,

  -- Conteudo do pedido
  title               TEXT         NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  description         TEXT         CHECK (description IS NULL OR length(description) <= 5000),
  observations        TEXT         CHECK (observations IS NULL OR length(observations) <= 2000),

  -- Janela proposta
  proposed_start      TIMESTAMPTZ  NOT NULL,
  proposed_end        TIMESTAMPTZ  NOT NULL,
  duration_minutes    INTEGER      NOT NULL
                                   GENERATED ALWAYS AS
                                   (EXTRACT(EPOCH FROM (proposed_end - proposed_start))::INT / 60) STORED,

  -- Prioridade pra ordenacao na fila
  priority            TEXT         NOT NULL DEFAULT 'normal'
                                   CHECK (priority IN ('low','normal','high','urgent')),

  -- State machine
  status              TEXT         NOT NULL DEFAULT 'pending'
                                   CHECK (status IN (
                                     'pending','in_review','approved','rejected',
                                     'cancelled','completed','expired'
                                   )),

  -- Decisao do revisor (admin OU socio destinatario)
  reviewer_id         UUID         REFERENCES public.members(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ,
  decision_reason     TEXT         CHECK (decision_reason IS NULL OR length(decision_reason) <= 2000),

  -- Reagendamento sugerido pelo socio
  suggested_start     TIMESTAMPTZ,
  suggested_end       TIMESTAMPTZ,
  suggested_at        TIMESTAMPTZ,

  -- Evento criado apos aprovacao (FK pra events)
  resulting_event_id  UUID         REFERENCES public.events(id) ON DELETE SET NULL,

  -- Snapshot de conflitos detectados no momento da analise
  detected_conflicts  JSONB        NOT NULL DEFAULT '[]'::jsonb,

  -- Metadata aberta (campos custom futuros)
  metadata            JSONB        NOT NULL DEFAULT '{}'::jsonb,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Invariantes
  CONSTRAINT mr_check_end_after_start CHECK (proposed_end > proposed_start),
  CONSTRAINT mr_check_max_duration    CHECK (proposed_end - proposed_start <= INTERVAL '8 hours'),
  CONSTRAINT mr_check_not_self        CHECK (target_partner_id != requester_id),
  CONSTRAINT mr_check_suggested_pair  CHECK (
    (suggested_start IS NULL AND suggested_end IS NULL)
    OR (suggested_start IS NOT NULL AND suggested_end IS NOT NULL AND suggested_end > suggested_start)
  ),
  CONSTRAINT mr_check_decision_consistency CHECK (
    status NOT IN ('approved','rejected')
    OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT mr_check_approved_has_event CHECK (
    status != 'approved' OR resulting_event_id IS NOT NULL
  )
);

COMMENT ON TABLE public.meeting_requests IS
  'Solicitacoes de reuniao criadas por funcionarios. Aprovacao gera row em events.';

-- Indices de performance
CREATE INDEX IF NOT EXISTS idx_mr_requester       ON public.meeting_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_mr_target_partner  ON public.meeting_requests(target_partner_id);
CREATE INDEX IF NOT EXISTS idx_mr_status_active   ON public.meeting_requests(status)
  WHERE status IN ('pending','in_review');
CREATE INDEX IF NOT EXISTS idx_mr_priority_queue  ON public.meeting_requests(priority, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mr_proposed_window ON public.meeting_requests
  USING GIST (target_partner_id, tstzrange(proposed_start, proposed_end, '[)'))
  WHERE status IN ('pending','in_review','approved');

CREATE TRIGGER meeting_requests_updated_at
  BEFORE UPDATE ON public.meeting_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 3. meeting_request_participants (M:N participantes extras)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_request_participants (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id  UUID         NOT NULL REFERENCES public.meeting_requests(id) ON DELETE CASCADE,
  member_id           UUID         NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  optional            BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_request_id, member_id)
);

COMMENT ON TABLE public.meeting_request_participants IS
  'Participantes extras (alem do requester e target_partner) que serao adicionados ao evento na aprovacao.';

CREATE INDEX IF NOT EXISTS idx_mrp_request ON public.meeting_request_participants(meeting_request_id);
CREATE INDEX IF NOT EXISTS idx_mrp_member  ON public.meeting_request_participants(member_id);

-- ============================================================
-- 4. meeting_request_events (audit append-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_request_events (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id  UUID         NOT NULL REFERENCES public.meeting_requests(id) ON DELETE CASCADE,
  actor_id            UUID         REFERENCES public.members(id) ON DELETE SET NULL,
  action              TEXT         NOT NULL CHECK (action IN (
                        'created','submitted','viewed','commented',
                        'approved','rejected','cancelled','expired',
                        'reschedule_suggested','reschedule_accepted','reschedule_declined',
                        'event_created','completed'
                      )),
  from_status         TEXT,
  to_status           TEXT,
  payload             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.meeting_request_events IS
  'Audit log append-only de toda transicao de status de meeting_requests. Imutavel.';

CREATE INDEX IF NOT EXISTS idx_mre_request   ON public.meeting_request_events(meeting_request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mre_action    ON public.meeting_request_events(action);

-- ============================================================
-- 5. meeting_request_comments (chat assincrono)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_request_comments (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id  UUID         NOT NULL REFERENCES public.meeting_requests(id) ON DELETE CASCADE,
  author_id           UUID         NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  body                TEXT         NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  visible_to_requester BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.meeting_request_comments IS
  'Comentarios opcionais em meeting_requests. visible_to_requester=false eh nota interna admin/socio.';

CREATE INDEX IF NOT EXISTS idx_mrc_request ON public.meeting_request_comments(meeting_request_id, created_at DESC);

-- ============================================================
-- 6. partner_office_hours (horarios disponiveis pra pedidos)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_office_hours (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          UUID         NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  day_of_week         INTEGER      NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=domingo
  start_time          TIME         NOT NULL,
  end_time            TIME         NOT NULL,
  effective_from      DATE         NOT NULL DEFAULT CURRENT_DATE,
  effective_until     DATE,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT poh_check_time_range CHECK (end_time > start_time),
  CONSTRAINT poh_check_effective  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

COMMENT ON TABLE public.partner_office_hours IS
  'Janelas semanais em que cada socio aceita receber meeting requests. Sem rows = aceita qualquer horario.';

CREATE INDEX IF NOT EXISTS idx_poh_partner ON public.partner_office_hours(partner_id, is_active);

-- ============================================================
-- 7. VIEW: disponibilidade segura pra funcionarios
-- ============================================================

DROP VIEW IF EXISTS public.v_availability_busy_slots CASCADE;

CREATE VIEW public.v_availability_busy_slots
WITH (security_invoker = true)  -- usa privilegios do caller, respeita RLS
AS
SELECT
  e.member_id,
  e.start_at,
  e.end_at,
  'busy'::text AS status,
  -- expoe titulo SOMENTE se evento eh public; senao NULL
  CASE WHEN e.visibility = 'public' THEN e.title ELSE NULL END AS title_if_public
FROM public.events e
WHERE e.status != 'cancelled'
  AND e.start_at >= NOW() - INTERVAL '7 days'
  AND e.start_at <= NOW() + INTERVAL '180 days';

COMMENT ON VIEW public.v_availability_busy_slots IS
  'View segura pra funcionarios verem busy slots sem leak de title/description/participants. Respeita RLS via security_invoker.';

-- ============================================================
-- 8. Realtime publication (UI sincroniza cross-tab)
-- ============================================================

-- Adiciona meeting_requests + meeting_request_events ao realtime
-- (events ja esta no realtime de migrations anteriores)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_requests;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_request_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_request_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_request_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_request_comments;
  END IF;
END $$;

COMMIT;
