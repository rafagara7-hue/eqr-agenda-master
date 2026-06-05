-- cancel_meeting_request v3 (migration 0027)
-- Permite o solicitante (ou admin) desmarcar uma reuniao ja APROVADA.
-- Quando ha um evento vinculado (resulting_event_id), DELETA o evento —
-- a FK event_participants -> events e ON DELETE CASCADE, entao some
-- automaticamente do calendario de ambos os participantes.
--
-- Antes (v2 / 0019): bloqueava com 'already decided' se status != pending|in_review.
-- Agora: aceita pending, in_review e approved. Audit registra deleted_event_id quando aplicavel.

CREATE OR REPLACE FUNCTION public.cancel_meeting_request(
  p_request_id uuid,
  p_requester_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_actor_id uuid;
  v_current_status text;
  v_owner_id uuid;
  v_event_id uuid;
BEGIN
  v_actor_id := public.eqr_get_member_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not authorized: no member row for user' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id <> p_requester_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: only requester or admin can cancel' USING ERRCODE = '42501';
  END IF;

  -- Lock pessimista para evitar TOCTOU
  SELECT status, requester_id, resulting_event_id
    INTO v_current_status, v_owner_id, v_event_id
    FROM public.meeting_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'not found: meeting request does not exist' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner_id <> p_requester_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: only requester or admin can cancel' USING ERRCODE = '42501';
  END IF;

  -- Estados cancelaveis: pending, in_review, approved.
  -- (rejected/cancelled/completed/expired sao terminais — nao reabrir)
  IF v_current_status NOT IN ('pending', 'in_review', 'approved') THEN
    RAISE EXCEPTION 'cannot cancel from status %', v_current_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.meeting_requests
     SET status = 'cancelled'
   WHERE id = p_request_id;

  -- Se ha evento vinculado (reuniao aprovada), deleta. CASCADE em
  -- event_participants e event_reminders limpa o restante.
  IF v_event_id IS NOT NULL THEN
    DELETE FROM public.events WHERE id = v_event_id;
  END IF;

  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    p_request_id,
    v_actor_id,
    'cancelled',
    v_current_status,
    'cancelled',
    CASE
      WHEN v_event_id IS NOT NULL AND v_actor_id <> p_requester_id
        THEN jsonb_build_object('on_behalf_of', p_requester_id, 'deleted_event_id', v_event_id)
      WHEN v_event_id IS NOT NULL
        THEN jsonb_build_object('deleted_event_id', v_event_id)
      WHEN v_actor_id <> p_requester_id
        THEN jsonb_build_object('on_behalf_of', p_requester_id)
      ELSE '{}'::jsonb
    END
  );

  RETURN true;
END;
$func$;

COMMENT ON FUNCTION public.cancel_meeting_request(uuid, uuid) IS
  'v3 (migration 0027): cancela request (status pending/in_review/approved). Para approved, deleta o evento vinculado (CASCADE em event_participants). Audit grava deleted_event_id e on_behalf_of quando admin cancela.';
