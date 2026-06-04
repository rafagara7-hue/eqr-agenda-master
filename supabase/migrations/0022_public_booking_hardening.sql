-- ============================================================
-- Migration 0022: Hardening do form publico (PR #15 audit fixes)
-- ============================================================
-- Aplica 7 blockers identificados em audit multi-agente:
--
-- A) public_create_meeting_request:
--    - Regex de phone (BR + intl flexible)
--    - Teto em proposed_start (max +2 anos)
--    - MAX length checks (espelha CHECKs da tabela, falha cedo)
--    - Dedup: rejeita se mesmo phone+target tem pending nos ultimos 10min
--    - Remove 'name' do payload do audit event (PII duplicada)
--
-- B) public_get_partner_availability:
--    - Overlap fix usando tstzrange (eventos cruzando dayStart somem hoje)
--    - Reduz range max de 60d pra 14d
--    - Clamp p_from >= now() - 1 dia, p_to <= now() + 90 dias
--    - Marca como STABLE (otimizacao do planner)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- A) public_create_meeting_request v2 (hardening)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_create_meeting_request(
  p_external_name text,
  p_external_phone text,
  p_target_partner_id uuid,
  p_title text,
  p_proposed_start timestamptz,
  p_proposed_end timestamptz,
  p_description text DEFAULT NULL,
  p_observations text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_external_id uuid;
  v_request_id uuid;
  v_target_role text;
  v_combined_obs text;
  v_clean_phone text;
  v_dup_count int;
BEGIN
  -- Limpa input
  p_external_name := trim(coalesce(p_external_name, ''));
  v_clean_phone   := trim(coalesce(p_external_phone, ''));
  p_title         := trim(coalesce(p_title, ''));

  -- Validacoes basicas
  IF length(p_external_name) < 2 THEN
    RAISE EXCEPTION 'invalid: name required (min 2 chars)' USING ERRCODE = '22023';
  END IF;
  IF length(p_external_name) > 120 THEN
    RAISE EXCEPTION 'invalid: name too long (max 120)' USING ERRCODE = '22023';
  END IF;

  IF length(v_clean_phone) < 8 THEN
    RAISE EXCEPTION 'invalid: phone required (min 8 chars)' USING ERRCODE = '22023';
  END IF;
  IF length(v_clean_phone) > 40 THEN
    RAISE EXCEPTION 'invalid: phone too long (max 40)' USING ERRCODE = '22023';
  END IF;
  -- Regex flexivel: digitos, espacos, parens, hifen, ponto, +
  IF v_clean_phone !~ '^[+0-9 ()\-.]{8,40}$' THEN
    RAISE EXCEPTION 'invalid phone format' USING ERRCODE = '22023';
  END IF;

  IF length(p_title) < 3 THEN
    RAISE EXCEPTION 'invalid: title required (min 3 chars)' USING ERRCODE = '22023';
  END IF;
  IF length(p_title) > 200 THEN
    RAISE EXCEPTION 'invalid: title too long (max 200)' USING ERRCODE = '22023';
  END IF;

  IF p_description IS NOT NULL AND length(p_description) > 2000 THEN
    RAISE EXCEPTION 'invalid: description too long (max 2000)' USING ERRCODE = '22023';
  END IF;
  IF p_observations IS NOT NULL AND length(p_observations) > 2000 THEN
    RAISE EXCEPTION 'invalid: observations too long (max 2000)' USING ERRCODE = '22023';
  END IF;

  -- Validacoes temporais
  IF p_proposed_end <= p_proposed_start THEN
    RAISE EXCEPTION 'invalid time range: end must be after start' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_end - p_proposed_start > INTERVAL '8 hours' THEN
    RAISE EXCEPTION 'invalid duration: max 8 hours' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_start < now() THEN
    RAISE EXCEPTION 'invalid: cannot schedule in the past' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_start > now() + INTERVAL '2 years' THEN
    RAISE EXCEPTION 'invalid: cannot schedule more than 2 years ahead' USING ERRCODE = '22023';
  END IF;

  -- Target valido
  SELECT role INTO v_target_role
    FROM public.members
   WHERE id = p_target_partner_id AND is_active = true;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'not found: target partner member' USING ERRCODE = 'P0002';
  END IF;
  IF v_target_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'forbidden: target must be partner or admin' USING ERRCODE = '42501';
  END IF;

  -- Dedup: mesmo phone+target em pending nos ultimos 10min eh duplicata
  SELECT COUNT(*) INTO v_dup_count
    FROM public.meeting_requests
   WHERE target_partner_id = p_target_partner_id
     AND status = 'pending'
     AND created_at > now() - INTERVAL '10 minutes'
     AND metadata->'external'->>'phone' = v_clean_phone;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'duplicate: a recent request already exists for this phone (wait 10 minutes)' USING ERRCODE = 'P0001';
  END IF;

  -- Placeholder external
  SELECT id INTO v_external_id
    FROM public.members
   WHERE slug = 'external' AND is_active = true;
  IF v_external_id IS NULL THEN
    RAISE EXCEPTION 'config error: external placeholder member missing' USING ERRCODE = 'P0001';
  END IF;

  v_combined_obs := 'Contato: ' || p_external_name || ' (' || v_clean_phone || ')';
  IF p_observations IS NOT NULL AND length(trim(p_observations)) > 0 THEN
    v_combined_obs := v_combined_obs || E'\n\n' || trim(p_observations);
  END IF;

  INSERT INTO public.meeting_requests (
    requester_id, target_partner_id, title, description, observations,
    proposed_start, proposed_end, priority, status, metadata
  ) VALUES (
    v_external_id,
    p_target_partner_id,
    p_title,
    p_description,
    v_combined_obs,
    p_proposed_start,
    p_proposed_end,
    'normal',
    'pending',
    jsonb_build_object(
      'external', jsonb_build_object(
        'name', p_external_name,
        'phone', v_clean_phone,
        'source', 'public_form'
      )
    )
  ) RETURNING id INTO v_request_id;

  -- Audit: payload SEM PII (LGPD: PII so em metadata da request, nao em audit imutavel)
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    v_request_id,
    v_external_id,
    'created',
    NULL,
    'pending',
    jsonb_build_object('external', true, 'source', 'public_form')
  );

  RETURN v_request_id;
END;
$$;

-- Mantem grants existentes (CREATE OR REPLACE preserva)
REVOKE ALL ON FUNCTION public.public_create_meeting_request(text, text, uuid, text, timestamptz, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_create_meeting_request(text, text, uuid, text, timestamptz, timestamptz, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.public_create_meeting_request IS
  'v2 (0022): hardening — phone regex, max length checks, teto proposed_start +2y, dedup 10min por phone+target, audit payload sem PII.';

-- ────────────────────────────────────────────────────────────
-- B) public_get_partner_availability v2 (overlap fix + clamp + STABLE)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_get_partner_availability(
  p_partner_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  start_at timestamptz,
  end_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_min_from timestamptz := now() - INTERVAL '1 day';
  v_max_to   timestamptz := now() + INTERVAL '90 days';
BEGIN
  -- Clamp do range pra prevenir enumeracao agressiva
  IF p_from < v_min_from THEN p_from := v_min_from; END IF;
  IF p_to   > v_max_to   THEN p_to   := v_max_to;   END IF;

  IF p_to <= p_from THEN
    RAISE EXCEPTION 'invalid range: to must be after from' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > INTERVAL '14 days' THEN
    RAISE EXCEPTION 'range too wide: max 14 days' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members
     WHERE id = p_partner_id
       AND is_active = true
       AND role IN ('member', 'admin')
  ) THEN
    RAISE EXCEPTION 'not found: partner' USING ERRCODE = 'P0002';
  END IF;

  -- Overlap fix: usa tstzrange overlap em vez de filtrar so por start_at
  -- (eventos que cruzam dayStart somem do filtro antigo).
  RETURN QUERY
    SELECT e.start_at, e.end_at
      FROM public.events e
     WHERE e.member_id = p_partner_id
       AND e.status <> 'cancelled'
       AND tstzrange(e.start_at, e.end_at, '[)') && tstzrange(p_from, p_to, '[)')
     ORDER BY e.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_partner_availability(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_partner_availability(uuid, timestamptz, timestamptz) TO anon, authenticated;

COMMENT ON FUNCTION public.public_get_partner_availability IS
  'v2 (0022): hardening — STABLE marker, overlap via tstzrange (fix bug que sumia eventos cruzando bordas), range max 14d, clamp now()-1d/+90d. Anon-callable pro form publico /agendar.';
