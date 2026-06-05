-- ============================================================
-- Migration 0018: Audit trail via SECURITY DEFINER
-- ============================================================
-- Bug pre-existente: repo.create()/repo.cancel() inseriam linhas
-- diretamente em meeting_request_events. RLS bloqueia INSERT
-- para nao-admins (a tabela so tem policy de SELECT + admin_all).
-- Resultado: timeline de eventos sem registros de criacao/cancelamento
-- pra funcionarios/socios.
--
-- Fix: mover insercoes para 2 funcoes SECURITY DEFINER, espelhando
-- o padrao ja usado em approve_meeting_request/reject_meeting_request
-- (migration 0017).
--
-- Comportamento:
-- - create_meeting_request: cria meeting_request + participants + audit event 'created'
-- - cancel_meeting_request: muda status pra cancelled + audit event 'cancelled'
-- Ambas validam autorizacao internamente; nao confiam em RLS pra autorizacao.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- create_meeting_request
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_meeting_request(
  p_requester_id uuid,
  p_target_partner_id uuid,
  p_title text,
  p_proposed_start timestamptz,
  p_proposed_end timestamptz,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_participant_ids uuid[] DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request_id uuid;
  v_actor_id uuid;
BEGIN
  -- Autorizacao: caller deve ser o proprio requester ou admin
  v_actor_id := public.eqr_get_member_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not authorized: no member row for user' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id <> p_requester_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: can only create requests for yourself' USING ERRCODE = '42501';
  END IF;

  -- Sanity check: requester e target devem existir e estar ativos
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_requester_id AND is_active = true) THEN
    RAISE EXCEPTION 'not found: requester member' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_target_partner_id AND is_active = true) THEN
    RAISE EXCEPTION 'not found: target partner member' USING ERRCODE = 'P0002';
  END IF;

  -- Cria a request
  INSERT INTO public.meeting_requests (
    requester_id, target_partner_id, title, description,
    proposed_start, proposed_end, priority, status
  ) VALUES (
    p_requester_id, p_target_partner_id, p_title, p_description,
    p_proposed_start, p_proposed_end, COALESCE(p_priority, 'normal'), 'pending'
  ) RETURNING id INTO v_request_id;

  -- Participants opcionais
  IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.meeting_request_participants (meeting_request_id, member_id, optional)
    SELECT v_request_id, unnest(p_participant_ids), false
    ON CONFLICT DO NOTHING;
  END IF;

  -- Audit event 'created' (era silenciosamente bloqueado pelo RLS antes)
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    v_request_id, p_requester_id, 'created', NULL, 'pending', '{}'::jsonb
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_meeting_request IS
  'Cria meeting_request + participants + audit event "created" atomicamente. Bypass RLS via SECURITY DEFINER pra garantir registro no audit trail. Valida que caller eh requester ou admin.';

-- ────────────────────────────────────────────────────────────
-- cancel_meeting_request
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_meeting_request(
  p_request_id uuid,
  p_requester_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_current_status text;
  v_owner_id uuid;
BEGIN
  v_actor_id := public.eqr_get_member_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not authorized: no member row for user' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id <> p_requester_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: only requester or admin can cancel' USING ERRCODE = '42501';
  END IF;

  -- Lock pessimista (mesmo padrao de approve_meeting_request)
  SELECT status, requester_id
    INTO v_current_status, v_owner_id
    FROM public.meeting_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'not found: meeting request does not exist' USING ERRCODE = 'P0002';
  END IF;

  -- Re-checa ownership (defesa caso v_actor_id sofra TOCTOU)
  IF v_owner_id <> p_requester_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: only requester or admin can cancel' USING ERRCODE = '42501';
  END IF;

  IF v_current_status NOT IN ('pending', 'in_review') THEN
    RAISE EXCEPTION 'already decided: cannot cancel request with status %', v_current_status USING ERRCODE = 'P0001';
  END IF;

  -- Update + audit em sequencia (mesma transacao)
  UPDATE public.meeting_requests
     SET status = 'cancelled',
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    p_request_id, p_requester_id, 'cancelled', v_current_status, 'cancelled', '{}'::jsonb
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_meeting_request(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_meeting_request(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_meeting_request(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_meeting_request IS
  'Cancela meeting_request + grava audit event "cancelled" atomicamente. Bypass RLS via SECURITY DEFINER. Valida ownership, faz lock pessimista, e impede cancelar requests ja decididas.';

-- ────────────────────────────────────────────────────────────
-- Backfill opcional dos audits faltantes
-- ────────────────────────────────────────────────────────────
-- Para requests existentes criadas/canceladas antes desta migration,
-- os eventos 'created'/'cancelled' nunca foram registrados. Backfill:

DO $$
BEGIN
  -- 'created' faltantes: pra toda request que nao tem evento created
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload, created_at
  )
  SELECT mr.id, mr.requester_id, 'created', NULL, 'pending', '{"backfilled":true}'::jsonb, mr.created_at
    FROM public.meeting_requests mr
   WHERE NOT EXISTS (
     SELECT 1 FROM public.meeting_request_events ev
      WHERE ev.meeting_request_id = mr.id
        AND ev.action = 'created'
   );

  -- 'cancelled' faltantes: requests status=cancelled sem audit
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload, created_at
  )
  SELECT mr.id, mr.requester_id, 'cancelled', NULL, 'cancelled', '{"backfilled":true}'::jsonb, mr.updated_at
    FROM public.meeting_requests mr
   WHERE mr.status = 'cancelled'
     AND NOT EXISTS (
       SELECT 1 FROM public.meeting_request_events ev
        WHERE ev.meeting_request_id = mr.id
          AND ev.action = 'cancelled'
     );
END $$;
