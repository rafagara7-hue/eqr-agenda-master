-- ============================================================
-- Migration 0019: Fix 3 issues encontrados na auditoria da 0018
-- ============================================================
-- Issues:
--
-- 1) AUDIT actor_id: 0018 gravava p_requester_id como actor_id no
--    audit event. Quando admin agia em nome de outro (caller != requester),
--    o admin ficava invisivel no audit trail. Fix: usar v_actor_id (real
--    caller via eqr_get_member_id) + payload on_behalf_of quando difere.
--
-- 2) ROLE GATING: 0018 so checava is_active=true no target_partner. O
--    RLS policy original (meeting_requests_insert_requester em 0017:91-97)
--    tambem garantia role IN ('member','admin'). Como SECURITY DEFINER
--    bypassa RLS, employee podia virar target. Fix: SELECT role + check
--    explicito.
--
-- 3) OBSERVATIONS: 0018 nao recebia p_observations — campo enviado pela
--    API era silenciosamente descartado. Bug pre-existente que veio do
--    repo direct-insert antigo (observations: null hardcoded). Fix:
--    adicionar p_observations text DEFAULT NULL na assinatura + INSERT.
--
-- Adicional: validacoes de janela temporal + self-target pra evitar
-- mensagens cruas do Postgres CHECK constraint vazarem pro user.
-- ============================================================

-- Drop da assinatura antiga (8 args) para evitar overload ambiguo
-- com a nova (9 args). Migration 0018 ficaria orfa em ambientes
-- novos onde 0019 roda direto, mas ja foi aplicada em prod.
DROP FUNCTION IF EXISTS public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, uuid[]);

-- ────────────────────────────────────────────────────────────
-- create_meeting_request v2 (com observations + role check + actor fix)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_meeting_request(
  p_requester_id uuid,
  p_target_partner_id uuid,
  p_title text,
  p_proposed_start timestamptz,
  p_proposed_end timestamptz,
  p_description text DEFAULT NULL,
  p_observations text DEFAULT NULL,
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
  v_target_role text;
BEGIN
  v_actor_id := public.eqr_get_member_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not authorized: no member row for user' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id <> p_requester_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: can only create requests for yourself' USING ERRCODE = '42501';
  END IF;

  -- Validacoes explicitas (substitui mensagens cruas de CHECK constraint)
  IF p_proposed_end <= p_proposed_start THEN
    RAISE EXCEPTION 'invalid time range: end must be after start' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_end - p_proposed_start > INTERVAL '8 hours' THEN
    RAISE EXCEPTION 'invalid duration: max 8 hours' USING ERRCODE = '22023';
  END IF;
  IF p_requester_id = p_target_partner_id THEN
    RAISE EXCEPTION 'invalid: cannot request meeting with yourself' USING ERRCODE = 'P0001';
  END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'invalid priority: must be low|normal|high|urgent' USING ERRCODE = '22023';
  END IF;

  -- Requester deve existir + ativo
  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_requester_id AND is_active = true) THEN
    RAISE EXCEPTION 'not found: requester member' USING ERRCODE = 'P0002';
  END IF;

  -- Target deve existir + ativo + ROLE PARTNER OR ADMIN
  -- (espelha policy meeting_requests_insert_requester em 0017:91-97
  --  que foi bypassada pelo SECURITY DEFINER)
  SELECT role INTO v_target_role
    FROM public.members
   WHERE id = p_target_partner_id AND is_active = true;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'not found: target partner member' USING ERRCODE = 'P0002';
  END IF;
  IF v_target_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'forbidden: target must be partner or admin' USING ERRCODE = '42501';
  END IF;

  -- Insert request com observations
  INSERT INTO public.meeting_requests (
    requester_id, target_partner_id, title, description, observations,
    proposed_start, proposed_end, priority, status
  ) VALUES (
    p_requester_id, p_target_partner_id, p_title, p_description, p_observations,
    p_proposed_start, p_proposed_end, COALESCE(p_priority, 'normal'), 'pending'
  ) RETURNING id INTO v_request_id;

  -- Participants opcionais
  IF p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 THEN
    INSERT INTO public.meeting_request_participants (meeting_request_id, member_id, optional)
    SELECT v_request_id, unnest(p_participant_ids), false
    ON CONFLICT DO NOTHING;
  END IF;

  -- Audit: actor_id = caller REAL (v_actor_id), com on_behalf_of se difere
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    v_request_id,
    v_actor_id,
    'created',
    NULL,
    'pending',
    CASE WHEN v_actor_id <> p_requester_id
      THEN jsonb_build_object('on_behalf_of', p_requester_id)
      ELSE '{}'::jsonb
    END
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, text, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, text, uuid[]) IS
  'v2 (migration 0019): cria meeting_request + audit "created". Bypass RLS via SECURITY DEFINER. Valida: caller eh requester ou admin; target_partner eh member/admin; janela temporal; auto-target. Audit grava actor_id real + on_behalf_of quando admin age por outro.';

-- ────────────────────────────────────────────────────────────
-- cancel_meeting_request v2 (actor_id fix)
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

  -- Lock pessimista (padrao do approve_meeting_request em 0017)
  SELECT status, requester_id
    INTO v_current_status, v_owner_id
    FROM public.meeting_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'not found: meeting request does not exist' USING ERRCODE = 'P0002';
  END IF;

  -- Re-checa ownership pos-lock (defesa contra TOCTOU)
  IF v_owner_id <> p_requester_id AND NOT public.eqr_is_admin() THEN
    RAISE EXCEPTION 'forbidden: only requester or admin can cancel' USING ERRCODE = '42501';
  END IF;

  IF v_current_status NOT IN ('pending', 'in_review') THEN
    RAISE EXCEPTION 'already decided: cannot cancel request with status %', v_current_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.meeting_requests
     SET status = 'cancelled'
   WHERE id = p_request_id;

  -- Audit: actor_id = caller REAL (v_actor_id), com on_behalf_of se difere
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    p_request_id,
    v_actor_id,
    'cancelled',
    v_current_status,
    'cancelled',
    CASE WHEN v_actor_id <> p_requester_id
      THEN jsonb_build_object('on_behalf_of', p_requester_id)
      ELSE '{}'::jsonb
    END
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.cancel_meeting_request(uuid, uuid) IS
  'v2 (migration 0019): cancela request + audit "cancelled". Bypass RLS via SECURITY DEFINER. Lock pessimista, valida ownership + status. Audit grava actor_id real + on_behalf_of quando admin cancela por outro.';
