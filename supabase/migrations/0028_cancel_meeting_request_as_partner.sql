-- Migration 0028: cancel_meeting_request_as_partner
--
-- Feature: permite que o sócio destinatário (target_partner) cancele uma
-- reunião APROVADA que é EXTERNA (vinda do form público /agendar).
-- Quando cancela, modal coleta motivo. Evento é deletado (CASCADE em
-- event_participants). Audit registra motivo + contato externo (name+phone
-- da metadata) + qual sócio cancelou + flag notification_pending=true.
--
-- Admin precisa notificar o externo manualmente:
-- - AdminMeetingsClient filtra status='cancelled' + metadata.external + notification_pending
-- - Exibe: nome+telefone, motivo, sócio que cancelou
-- - Após notificar, admin marca metadata.notification_pending=false
--
-- DEPENDENCIAS: migration 0027 (cancel_meeting_request v3),
-- funções eqr_get_member_id() e eqr_is_admin() (migration 0017).

CREATE OR REPLACE FUNCTION public.cancel_meeting_request_as_partner(
  p_request_id uuid,
  p_partner_id uuid,
  p_reason text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_actor_id uuid;
  v_current_status text;
  v_target_partner_id uuid;
  v_event_id uuid;
  v_metadata jsonb;
  v_external_contact jsonb;
BEGIN
  v_actor_id := public.eqr_get_member_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not authorized: no member row for user' USING ERRCODE = '42501';
  END IF;

  -- Lock pessimista
  SELECT status, target_partner_id, resulting_event_id, metadata
    INTO v_current_status, v_target_partner_id, v_event_id, v_metadata
    FROM public.meeting_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_target_partner_id IS NULL THEN
    RAISE EXCEPTION 'not found: meeting request does not exist' USING ERRCODE = 'P0002';
  END IF;

  -- Autorização: só target_partner ou admin
  IF v_actor_id <> v_target_partner_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: only target partner or admin can cancel' USING ERRCODE = '42501';
  END IF;

  -- Só funciona para reuniões EXTERNAS (metadata.external presente)
  IF v_metadata ->> 'external' IS NULL THEN
    RAISE EXCEPTION 'forbidden: this operation is only for external meetings' USING ERRCODE = '42501';
  END IF;

  -- Só cancelável quando approved (workflow externo já decidido)
  IF v_current_status NOT IN ('approved') THEN
    RAISE EXCEPTION 'cannot cancel from status %', v_current_status USING ERRCODE = 'P0001';
  END IF;

  -- Marca cancelled + notification_pending=true
  UPDATE public.meeting_requests
     SET status = 'cancelled',
         metadata = jsonb_set(metadata, '{notification_pending}', 'true'::jsonb)
   WHERE id = p_request_id;

  -- Deleta evento vinculado (CASCADE em event_participants/event_reminders)
  IF v_event_id IS NOT NULL THEN
    DELETE FROM public.events WHERE id = v_event_id;
  END IF;

  v_external_contact := v_metadata -> 'external';

  -- Audit: motivo + contato externo + partner que cancelou
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    p_request_id,
    v_actor_id,
    'cancelled',
    v_current_status,
    'cancelled',
    jsonb_build_object(
      'reason', COALESCE(p_reason, ''),
      'cancelled_by_partner_id', v_actor_id,
      'external_contact', v_external_contact,
      'deleted_event_id', v_event_id,
      'notification_pending', true
    )
  );

  RETURN true;
END;
$func$;

COMMENT ON FUNCTION public.cancel_meeting_request_as_partner(uuid, uuid, text) IS
  'v1 (migration 0028): target_partner cancela reuniao APPROVED + external. Deleta evento (CASCADE). Audit registra motivo + contato externo + partner que cancelou. Marca metadata.notification_pending=true pra admin notificar depois.';

REVOKE ALL ON FUNCTION public.cancel_meeting_request_as_partner(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_meeting_request_as_partner(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_meeting_request_as_partner(uuid, uuid, text) TO authenticated;
