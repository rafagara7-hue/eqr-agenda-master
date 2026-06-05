-- ============================================================
-- Migration 0020: Public booking form (anon submissions)
-- ============================================================
-- Permite que pessoas SEM conta no sistema solicitem reuniao
-- via URL publica /agendar. Sem login: form coleta nome+telefone
-- direto e envia.
--
-- Estrategia:
-- - 1 placeholder member 'Colaboradores' (role='employee',
--   user_id=NULL). Todas requests externas usam ele como requester.
-- - Nome+telefone gravados em meeting_requests.metadata->'external'
--   e prefixados em observations pra surfaces sem mexer no UI atual.
-- - 2 funcoes SECURITY DEFINER callable por anon:
--     public_create_meeting_request: cria request + audit
--     public_get_partner_availability: retorna busy slots do socio
--   sem detalhes de eventos (privacidade).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Permite member sem auth user (placeholder externo)
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.members ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.members.user_id IS
  'auth.users link. NULL para membros placeholder (ex.: Colaboradores) que nao logam.';

-- ────────────────────────────────────────────────────────────
-- 2) Placeholder member
-- ────────────────────────────────────────────────────────────

INSERT INTO public.members (
  id, user_id, name, slug, role, color, color_hex, is_active
) VALUES (
  '00000000-ee00-0000-0000-000000000001'::uuid,
  NULL,
  'Colaboradores',
  'external',
  'employee',
  'gray',
  '#9CA3AF',
  true
) ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      color = EXCLUDED.color,
      color_hex = EXCLUDED.color_hex,
      is_active = true;

COMMENT ON TABLE public.members IS
  'Membros do sistema. Inclui placeholder "external" (slug=external) que representa todas as solicitacoes anonimas vindas de /agendar.';

-- ────────────────────────────────────────────────────────────
-- 3) public_create_meeting_request — anon callable
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
BEGIN
  -- Validacoes basicas
  IF p_external_name IS NULL OR length(trim(p_external_name)) < 2 THEN
    RAISE EXCEPTION 'invalid: name required (min 2 chars)' USING ERRCODE = '22023';
  END IF;
  IF p_external_phone IS NULL OR length(trim(p_external_phone)) < 8 THEN
    RAISE EXCEPTION 'invalid: phone required (min 8 chars)' USING ERRCODE = '22023';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) < 3 THEN
    RAISE EXCEPTION 'invalid: title required (min 3 chars)' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_end <= p_proposed_start THEN
    RAISE EXCEPTION 'invalid time range: end must be after start' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_end - p_proposed_start > INTERVAL '8 hours' THEN
    RAISE EXCEPTION 'invalid duration: max 8 hours' USING ERRCODE = '22023';
  END IF;
  IF p_proposed_start < now() THEN
    RAISE EXCEPTION 'invalid: cannot schedule in the past' USING ERRCODE = '22023';
  END IF;

  -- Target deve existir + ativo + role partner/admin
  SELECT role INTO v_target_role
    FROM public.members
   WHERE id = p_target_partner_id AND is_active = true;
  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'not found: target partner member' USING ERRCODE = 'P0002';
  END IF;
  IF v_target_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'forbidden: target must be partner or admin' USING ERRCODE = '42501';
  END IF;

  -- Pega ID do placeholder external
  SELECT id INTO v_external_id
    FROM public.members
   WHERE slug = 'external' AND is_active = true;
  IF v_external_id IS NULL THEN
    RAISE EXCEPTION 'config error: external placeholder member missing' USING ERRCODE = 'P0001';
  END IF;

  -- Observations combina contato + texto do user
  v_combined_obs := 'Contato: ' || trim(p_external_name) || ' (' || trim(p_external_phone) || ')';
  IF p_observations IS NOT NULL AND length(trim(p_observations)) > 0 THEN
    v_combined_obs := v_combined_obs || E'\n\n' || trim(p_observations);
  END IF;

  -- Insert request com metadata.external + observations prefixadas
  INSERT INTO public.meeting_requests (
    requester_id, target_partner_id, title, description, observations,
    proposed_start, proposed_end, priority, status, metadata
  ) VALUES (
    v_external_id,
    p_target_partner_id,
    trim(p_title),
    p_description,
    v_combined_obs,
    p_proposed_start,
    p_proposed_end,
    'normal',
    'pending',
    jsonb_build_object(
      'external', jsonb_build_object(
        'name', trim(p_external_name),
        'phone', trim(p_external_phone),
        'source', 'public_form'
      )
    )
  ) RETURNING id INTO v_request_id;

  -- Audit: actor_id eh o proprio external placeholder
  INSERT INTO public.meeting_request_events (
    meeting_request_id, actor_id, action, from_status, to_status, payload
  ) VALUES (
    v_request_id,
    v_external_id,
    'created',
    NULL,
    'pending',
    jsonb_build_object('external', true, 'name', trim(p_external_name))
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.public_create_meeting_request(text, text, uuid, text, timestamptz, timestamptz, text, text) FROM PUBLIC;
-- DEPENDE de anon EXECUTE pra que o form publico funcione sem login:
GRANT EXECUTE ON FUNCTION public.public_create_meeting_request(text, text, uuid, text, timestamptz, timestamptz, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.public_create_meeting_request IS
  'Anon-callable: cria meeting_request a partir do form publico /agendar. Usa placeholder member external como requester_id; nome+telefone vao em observations + metadata.external. SECURITY DEFINER pra bypassar RLS que exigiria membership.';

-- ────────────────────────────────────────────────────────────
-- 4) public_get_partner_availability — anon callable
-- ────────────────────────────────────────────────────────────
-- Permite o form publico mostrar conflict check sem expor titulos
-- de eventos privados. Retorna apenas (start, end) — pares.

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
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Validacao basica de range pra evitar abuso
  IF p_to - p_from > INTERVAL '60 days' THEN
    RAISE EXCEPTION 'range too wide: max 60 days' USING ERRCODE = '22023';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'invalid range: to must be after from' USING ERRCODE = '22023';
  END IF;

  -- Verifica que partner existe + e member/admin (privacidade: nao expor existencia de outros members)
  IF NOT EXISTS (
    SELECT 1 FROM public.members
     WHERE id = p_partner_id
       AND is_active = true
       AND role IN ('member', 'admin')
  ) THEN
    RAISE EXCEPTION 'not found: partner' USING ERRCODE = 'P0002';
  END IF;

  -- Retorna apenas as janelas ocupadas (sem titulo, sem ID)
  RETURN QUERY
    SELECT e.start_at, e.end_at
      FROM public.events e
     WHERE e.member_id = p_partner_id
       AND e.status <> 'cancelled'
       AND e.start_at >= p_from
       AND e.start_at <= p_to
     ORDER BY e.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_partner_availability(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_partner_availability(uuid, timestamptz, timestamptz) TO anon, authenticated;

COMMENT ON FUNCTION public.public_get_partner_availability IS
  'Anon-callable: retorna apenas (start, end) dos eventos confirmados do socio na janela. Sem titulo, sem id — privacidade. Usado pelo form publico /agendar pra conflict check pre-submit. Range max 60 dias.';

-- ────────────────────────────────────────────────────────────
-- 5) RLS: garantir que anon NAO acessa meeting_requests diretamente
-- ────────────────────────────────────────────────────────────
-- meeting_requests ja tem RLS habilitada (0017). Anon nao tem policy
-- de SELECT/INSERT/UPDATE/DELETE, entao so consegue via as funcoes
-- SECURITY DEFINER acima. Esse comentario eh defensivo — sem mudanca
-- de policy aqui.
