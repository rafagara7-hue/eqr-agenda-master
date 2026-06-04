-- Migration: 0017_meeting_hub_rls
--
-- Row Level Security policies + functions transacionais do Meeting Hub.
--
-- HELPERS USADOS (definidos em 0007):
--   public.eqr_is_admin()        - returns BOOLEAN
--   public.eqr_get_member_id()   - returns UUID
--
-- HELPER NOVO:
--   public.eqr_get_member_role() - returns TEXT (admin|member|employee)
--
-- FUNCTIONS NOVAS:
--   public.approve_meeting_request(p_request_id, p_reviewer_id, p_note)
--   public.reject_meeting_request(p_request_id, p_reviewer_id, p_reason)
--   public.suggest_reschedule(p_request_id, p_partner_id, p_new_start, p_new_end)
--   public.detect_meeting_conflicts(p_partner_id, p_start, p_end, p_exclude_event_id)
--
-- REVERSAO: 0017_meeting_hub_rls_DOWN.sql (DROP policies + DROP functions).

BEGIN;

-- ============================================================
-- Helper: eqr_get_member_role()
-- ============================================================

CREATE OR REPLACE FUNCTION public.eqr_get_member_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.members
  WHERE user_id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.eqr_get_member_role IS
  'Retorna role (admin|member|employee) do usuario logado, ou NULL se nao for membro ativo.';

-- ============================================================
-- ENABLE RLS em todas as novas tabelas
-- ============================================================

ALTER TABLE public.meeting_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_request_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_request_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_request_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_office_hours          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: meeting_requests
-- ============================================================

-- Admin: full access
CREATE POLICY "meeting_requests_admin_all"
  ON public.meeting_requests FOR ALL
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

-- Socio: pode ler pedidos enviados pra ele
CREATE POLICY "meeting_requests_select_target_partner"
  ON public.meeting_requests FOR SELECT
  TO authenticated
  USING (target_partner_id = public.eqr_get_member_id());

-- Socio: pode UPDATE pra aprovar/rejeitar/sugerir reagendamento OS PEDIDOS QUE SAO PRA ELE
-- (decisao: admin OU socio destinatario podem aprovar)
CREATE POLICY "meeting_requests_update_target_partner"
  ON public.meeting_requests FOR UPDATE
  TO authenticated
  USING (
    target_partner_id = public.eqr_get_member_id()
    AND status IN ('pending','in_review')
  )
  WITH CHECK (
    target_partner_id = public.eqr_get_member_id()
    -- WITH CHECK valida estado final: pode ir pra approved/rejected/in_review (com reagendamento)
    AND status IN ('approved','rejected','in_review','pending')
  );

-- Requester (funcionario): pode ler os proprios pedidos
CREATE POLICY "meeting_requests_select_requester"
  ON public.meeting_requests FOR SELECT
  TO authenticated
  USING (requester_id = public.eqr_get_member_id());

-- Requester: pode INSERT (so como ele mesmo, status=pending, target valido)
CREATE POLICY "meeting_requests_insert_requester"
  ON public.meeting_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = public.eqr_get_member_id()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.members
      WHERE id = target_partner_id
        AND role IN ('member','admin')
        AND is_active = TRUE
    )
  );

-- Requester: pode CANCELAR (UPDATE pra status='cancelled' enquanto pending/in_review)
CREATE POLICY "meeting_requests_cancel_requester"
  ON public.meeting_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = public.eqr_get_member_id()
    AND status IN ('pending','in_review')
  )
  WITH CHECK (
    requester_id = public.eqr_get_member_id()
    AND status = 'cancelled'
  );

-- Participante extra: pode ler pedidos onde foi listado
CREATE POLICY "meeting_requests_select_participant"
  ON public.meeting_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_request_participants
      WHERE meeting_request_id = meeting_requests.id
        AND member_id = public.eqr_get_member_id()
    )
  );

-- ============================================================
-- POLICIES: meeting_request_participants
-- ============================================================

CREATE POLICY "meeting_request_participants_admin_all"
  ON public.meeting_request_participants FOR ALL
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

-- Quem ve o pedido principal, ve os participantes
CREATE POLICY "meeting_request_participants_select_via_request"
  ON public.meeting_request_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_requests mr
      WHERE mr.id = meeting_request_id
        AND (
          mr.requester_id = public.eqr_get_member_id()
          OR mr.target_partner_id = public.eqr_get_member_id()
          OR member_id = public.eqr_get_member_id()
        )
    )
  );

-- Requester pode INSERT participantes nos seus proprios pedidos enquanto pending
CREATE POLICY "meeting_request_participants_insert_requester"
  ON public.meeting_request_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_requests mr
      WHERE mr.id = meeting_request_id
        AND mr.requester_id = public.eqr_get_member_id()
        AND mr.status = 'pending'
    )
  );

-- ============================================================
-- POLICIES: meeting_request_events (audit)
-- ============================================================

-- Admin: ve tudo
CREATE POLICY "meeting_request_events_admin_all"
  ON public.meeting_request_events FOR ALL
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

-- Quem ve o pedido principal, ve a audit
CREATE POLICY "meeting_request_events_select_via_request"
  ON public.meeting_request_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_requests mr
      WHERE mr.id = meeting_request_id
        AND (
          mr.requester_id = public.eqr_get_member_id()
          OR mr.target_partner_id = public.eqr_get_member_id()
          OR EXISTS (
            SELECT 1 FROM public.meeting_request_participants p
            WHERE p.meeting_request_id = mr.id
              AND p.member_id = public.eqr_get_member_id()
          )
        )
    )
  );

-- INSERT em audit: somente via functions SECURITY DEFINER (nao via INSERT direto do client)
-- Logo, nenhuma policy de INSERT pra authenticated. Service role only.

-- ============================================================
-- POLICIES: meeting_request_comments
-- ============================================================

CREATE POLICY "meeting_request_comments_admin_all"
  ON public.meeting_request_comments FOR ALL
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

-- Leitura: ve quem tem acesso ao pedido + respeita visible_to_requester flag
CREATE POLICY "meeting_request_comments_select"
  ON public.meeting_request_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_requests mr
      WHERE mr.id = meeting_request_id
        AND (
          mr.requester_id = public.eqr_get_member_id() AND visible_to_requester = TRUE
          OR mr.target_partner_id = public.eqr_get_member_id()
          OR author_id = public.eqr_get_member_id()
        )
    )
  );

-- INSERT: autor precisa ter acesso ao pedido E pode escrever como ele mesmo
CREATE POLICY "meeting_request_comments_insert_author"
  ON public.meeting_request_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = public.eqr_get_member_id()
    AND EXISTS (
      SELECT 1 FROM public.meeting_requests mr
      WHERE mr.id = meeting_request_id
        AND (mr.requester_id = author_id OR mr.target_partner_id = author_id)
    )
  );

-- ============================================================
-- POLICIES: partner_office_hours
-- ============================================================

CREATE POLICY "partner_office_hours_admin_all"
  ON public.partner_office_hours FOR ALL
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

-- Socio: pode gerenciar os proprios horarios
CREATE POLICY "partner_office_hours_partner_self"
  ON public.partner_office_hours FOR ALL
  TO authenticated
  USING (partner_id = public.eqr_get_member_id())
  WITH CHECK (partner_id = public.eqr_get_member_id());

-- Todos authenticated: podem LER horarios ativos (precisam saber quando pedir)
CREATE POLICY "partner_office_hours_select_active"
  ON public.partner_office_hours FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- ============================================================
-- FUNCTION: detect_meeting_conflicts
-- ============================================================

CREATE OR REPLACE FUNCTION public.detect_meeting_conflicts(
  p_partner_id        UUID,
  p_start             TIMESTAMPTZ,
  p_end               TIMESTAMPTZ,
  p_exclude_event_id  UUID DEFAULT NULL
) RETURNS TABLE (
  event_id    UUID,
  title       TEXT,
  start_at    TIMESTAMPTZ,
  end_at      TIMESTAMPTZ,
  overlap_min INTEGER
)
LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT
    e.id,
    -- Nao expoe titulo pra funcionarios; admin e socio veem
    CASE
      WHEN public.eqr_is_admin() OR public.eqr_get_member_id() = e.member_id THEN e.title
      ELSE 'Ocupado'::text
    END,
    e.start_at,
    e.end_at,
    EXTRACT(EPOCH FROM (
      LEAST(e.end_at, p_end) - GREATEST(e.start_at, p_start)
    ))::INT / 60
  FROM public.events e
  WHERE e.member_id = p_partner_id
    AND e.status != 'cancelled'
    AND tstzrange(e.start_at, e.end_at, '[)') && tstzrange(p_start, p_end, '[)')
    AND (p_exclude_event_id IS NULL OR e.id != p_exclude_event_id)
  ORDER BY e.start_at;
$$;

COMMENT ON FUNCTION public.detect_meeting_conflicts IS
  'Detecta conflitos no calendario do socio para uma janela proposta. Retorna eventos sobrepostos com overlap em minutos.';

-- ============================================================
-- FUNCTION: approve_meeting_request (transacional)
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_meeting_request(
  p_request_id     UUID,
  p_reviewer_id    UUID,
  p_decision_note  TEXT DEFAULT NULL
) RETURNS UUID  -- retorna event_id criado
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req      public.meeting_requests%ROWTYPE;
  v_reviewer public.members%ROWTYPE;
  v_event_id UUID;
  v_start    TIMESTAMPTZ;
  v_end      TIMESTAMPTZ;
BEGIN
  -- Lock pessimista da row pra evitar race com outro aprovador
  SELECT * INTO v_req FROM public.meeting_requests
  WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meeting_request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  -- Reviewer precisa existir e estar ativo
  SELECT * INTO v_reviewer FROM public.members
  WHERE id = p_reviewer_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reviewer % not found or inactive', p_reviewer_id USING ERRCODE = 'P0002';
  END IF;

  -- Autorizacao: admin OU target_partner pode aprovar
  IF v_reviewer.role != 'admin' AND v_reviewer.id != v_req.target_partner_id THEN
    RAISE EXCEPTION 'forbidden: only admin or target partner can approve'
      USING ERRCODE = '42501';
  END IF;

  -- State machine: so aprova se pending/in_review
  IF v_req.status NOT IN ('pending', 'in_review') THEN
    RAISE EXCEPTION 'cannot approve from status %', v_req.status USING ERRCODE = '22023';
  END IF;

  -- Usa janela sugerida pelo socio (se houver), senao a proposta original
  v_start := COALESCE(v_req.suggested_start, v_req.proposed_start);
  v_end   := COALESCE(v_req.suggested_end, v_req.proposed_end);

  -- Cria evento na agenda do socio destinatario
  INSERT INTO public.events (
    member_id, created_by, title, description,
    start_at, end_at, status, visibility,
    sync_status, metadata
  )
  VALUES (
    v_req.target_partner_id, p_reviewer_id,
    v_req.title, v_req.description,
    v_start, v_end, 'confirmed', 'private',
    'pending',  -- outbound N8N sync vai pegar
    jsonb_build_object('meeting_request_id', v_req.id)
  )
  RETURNING id INTO v_event_id;

  -- Adiciona requester como event_participant
  INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
  VALUES (v_event_id, v_req.requester_id, 'participant', FALSE)
  ON CONFLICT (event_id, member_id) DO NOTHING;

  -- Adiciona participantes extras
  INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
  SELECT v_event_id, member_id, 'participant', FALSE
  FROM public.meeting_request_participants
  WHERE meeting_request_id = v_req.id
  ON CONFLICT (event_id, member_id) DO NOTHING;

  -- Atualiza meeting_request
  UPDATE public.meeting_requests
  SET status = 'approved',
      reviewer_id = p_reviewer_id,
      reviewed_at = NOW(),
      decision_reason = p_decision_note,
      resulting_event_id = v_event_id
  WHERE id = p_request_id;

  -- Audit
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    p_request_id, p_reviewer_id, 'approved',
    v_req.status, 'approved',
    jsonb_build_object('event_id', v_event_id, 'note', p_decision_note)
  );

  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, payload
  ) VALUES (
    p_request_id, p_reviewer_id, 'event_created',
    jsonb_build_object('event_id', v_event_id)
  );

  RETURN v_event_id;
END $$;

COMMENT ON FUNCTION public.approve_meeting_request IS
  'Aprova meeting_request transacionalmente: cria event + event_participants, atualiza status, registra audit. Admin ou target_partner podem chamar.';

-- ============================================================
-- FUNCTION: reject_meeting_request
-- ============================================================

CREATE OR REPLACE FUNCTION public.reject_meeting_request(
  p_request_id     UUID,
  p_reviewer_id    UUID,
  p_reason         TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req      public.meeting_requests%ROWTYPE;
  v_reviewer public.members%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.meeting_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meeting_request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reviewer FROM public.members WHERE id = p_reviewer_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reviewer % not found or inactive', p_reviewer_id USING ERRCODE = 'P0002';
  END IF;

  IF v_reviewer.role != 'admin' AND v_reviewer.id != v_req.target_partner_id THEN
    RAISE EXCEPTION 'forbidden: only admin or target partner can reject'
      USING ERRCODE = '42501';
  END IF;

  IF v_req.status NOT IN ('pending', 'in_review') THEN
    RAISE EXCEPTION 'cannot reject from status %', v_req.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.meeting_requests
  SET status = 'rejected',
      reviewer_id = p_reviewer_id,
      reviewed_at = NOW(),
      decision_reason = p_reason
  WHERE id = p_request_id;

  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    p_request_id, p_reviewer_id, 'rejected',
    v_req.status, 'rejected',
    jsonb_build_object('reason', p_reason)
  );

  RETURN TRUE;
END $$;

-- ============================================================
-- FUNCTION: suggest_reschedule (socio sugere nova janela)
-- ============================================================

CREATE OR REPLACE FUNCTION public.suggest_reschedule(
  p_request_id      UUID,
  p_partner_id      UUID,
  p_new_start       TIMESTAMPTZ,
  p_new_end         TIMESTAMPTZ,
  p_message         TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req      public.meeting_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.meeting_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meeting_request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.target_partner_id != p_partner_id THEN
    RAISE EXCEPTION 'forbidden: only target partner can suggest reschedule'
      USING ERRCODE = '42501';
  END IF;

  IF v_req.status NOT IN ('pending', 'in_review') THEN
    RAISE EXCEPTION 'cannot suggest reschedule from status %', v_req.status USING ERRCODE = '22023';
  END IF;

  IF p_new_end <= p_new_start THEN
    RAISE EXCEPTION 'invalid time range' USING ERRCODE = '22023';
  END IF;

  UPDATE public.meeting_requests
  SET suggested_start = p_new_start,
      suggested_end   = p_new_end,
      suggested_at    = NOW(),
      status          = 'in_review'
  WHERE id = p_request_id;

  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    p_request_id, p_partner_id, 'reschedule_suggested',
    v_req.status, 'in_review',
    jsonb_build_object(
      'original_start', v_req.proposed_start,
      'original_end',   v_req.proposed_end,
      'new_start',      p_new_start,
      'new_end',        p_new_end,
      'message',        p_message
    )
  );

  RETURN TRUE;
END $$;

COMMIT;
