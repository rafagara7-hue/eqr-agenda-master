-- Fix: infinite recursion (42P17) between policies on
-- meeting_requests <-> meeting_request_participants.
--
-- The original policies cross-referenced each other:
--   meeting_requests_select_participant      -> SELECT meeting_request_participants
--   meeting_request_participants_select_via_request -> SELECT meeting_requests
-- which caused every SELECT on meeting_requests to fail with
--   "infinite recursion detected in policy for relation \"meeting_requests\""
-- making the partner meetings page return 0 rows for everyone.
--
-- Fix: extract the cross-table check into SECURITY DEFINER helpers so the
-- inner SELECTs run as the function owner (BYPASSRLS) and never re-enter
-- the originating policy.

BEGIN;

CREATE OR REPLACE FUNCTION public.eqr_is_meeting_participant(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_request_participants p
    WHERE p.meeting_request_id = p_request_id
      AND p.member_id = (
        SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.eqr_can_see_meeting_request(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_requests mr
    WHERE mr.id = p_request_id
      AND (
        mr.requester_id = (
          SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1
        )
        OR mr.target_partner_id = (
          SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.eqr_is_meeting_participant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.eqr_can_see_meeting_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eqr_is_meeting_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eqr_can_see_meeting_request(uuid) TO authenticated;

DROP POLICY IF EXISTS meeting_requests_select_participant ON public.meeting_requests;
CREATE POLICY meeting_requests_select_participant
  ON public.meeting_requests
  FOR SELECT
  TO authenticated
  USING (public.eqr_is_meeting_participant(id));

DROP POLICY IF EXISTS meeting_request_participants_select_via_request
  ON public.meeting_request_participants;
CREATE POLICY meeting_request_participants_select_via_request
  ON public.meeting_request_participants
  FOR SELECT
  TO authenticated
  USING (
    member_id = public.eqr_get_member_id()
    OR public.eqr_can_see_meeting_request(meeting_request_id)
  );

COMMIT;
