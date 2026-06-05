-- Fix: approve_meeting_request criava o evento mas nao inseria o
-- target_partner (dono do evento) em event_participants. O calendario
-- filtra por event_participants.member_id para nao-admins (ver
-- useCalendarEvents.ts), entao reunioes aprovadas nao apareciam no
-- calendario do sócio que aprovou.
--
-- EventRepository.syncParticipants sempre insere o host como 'owner'
-- (packages/database/src/repositories/EventRepository.ts:89-97);
-- a RPC agora segue o mesmo padrao.
--
-- Tambem faz backfill de events ja existentes onde o owner esta
-- ausente de event_participants.

CREATE OR REPLACE FUNCTION public.approve_meeting_request(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_decision_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_req public.meeting_requests%ROWTYPE;
  v_reviewer public.members%ROWTYPE;
  v_event_id uuid;
  v_start timestamptz;
  v_end timestamptz;
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
    RAISE EXCEPTION 'forbidden: only admin or target partner can approve' USING ERRCODE = '42501';
  END IF;

  IF v_req.status NOT IN ('pending', 'in_review') THEN
    RAISE EXCEPTION 'cannot approve from status %', v_req.status USING ERRCODE = '22023';
  END IF;

  v_start := COALESCE(v_req.suggested_start, v_req.proposed_start);
  v_end := COALESCE(v_req.suggested_end, v_req.proposed_end);

  INSERT INTO public.events (
    member_id, created_by, title, description, start_at, end_at,
    status, visibility, sync_status, metadata
  )
  VALUES (
    v_req.target_partner_id, p_reviewer_id, v_req.title, v_req.description, v_start, v_end,
    'confirmed', 'private', 'pending',
    jsonb_build_object('meeting_request_id', v_req.id)
  )
  RETURNING id INTO v_event_id;

  -- target_partner (dono do evento) como owner
  INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
  VALUES (v_event_id, v_req.target_partner_id, 'owner', TRUE)
  ON CONFLICT (event_id, member_id) DO NOTHING;

  -- requester como participant
  INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
  VALUES (v_event_id, v_req.requester_id, 'participant', FALSE)
  ON CONFLICT (event_id, member_id) DO NOTHING;

  -- participantes extras vindos da meeting_request
  INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
  SELECT v_event_id, member_id, 'participant', FALSE
    FROM public.meeting_request_participants
   WHERE meeting_request_id = v_req.id
  ON CONFLICT (event_id, member_id) DO NOTHING;

  UPDATE public.meeting_requests
     SET status = 'approved',
         reviewer_id = p_reviewer_id,
         reviewed_at = NOW(),
         decision_reason = p_decision_note,
         resulting_event_id = v_event_id
   WHERE id = p_request_id;

  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  )
  VALUES (
    p_request_id, p_reviewer_id, 'approved', v_req.status, 'approved',
    jsonb_build_object('event_id', v_event_id, 'note', p_decision_note)
  );

  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, payload
  )
  VALUES (
    p_request_id, p_reviewer_id, 'event_created',
    jsonb_build_object('event_id', v_event_id)
  );

  RETURN v_event_id;
END
$func$;

-- Backfill: garante owner em event_participants para events ja existentes.
INSERT INTO public.event_participants (event_id, member_id, role, can_edit)
SELECT e.id, e.member_id, 'owner', TRUE
  FROM public.events e
 WHERE NOT EXISTS (
   SELECT 1 FROM public.event_participants ep
    WHERE ep.event_id = e.id AND ep.member_id = e.member_id
 )
ON CONFLICT (event_id, member_id) DO NOTHING;
