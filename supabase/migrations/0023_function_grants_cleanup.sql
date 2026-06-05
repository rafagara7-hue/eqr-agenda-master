-- ============================================================
-- Migration 0023: Function grants cleanup (defense-in-depth)
-- ============================================================
-- Verificacao pos-deploy via Management API mostrou que varias
-- funcoes SECURITY DEFINER internas tem grants PUBLIC + anon.
-- Funcionalmente seguras (todas validam auth via eqr_get_member_id()
-- internamente e RAISE EXCEPTION quando NULL), mas defesa-em-profundidade
-- exige restringir a 'authenticated' (mais service_role implicito).
--
-- Migrations originais (0017, 0018, 0019) nao incluiram REVOKE FROM PUBLIC,
-- entao a default privilege do Postgres deu EXECUTE pra PUBLIC.
--
-- Esta migration:
-- - REVOKE FROM PUBLIC + anon em todas funcoes internas SECURITY DEFINER
-- - Mantem grants existentes pra anon nas public_* functions (intencional
--   pro form publico /agendar)
-- ============================================================

-- Internal write functions
REVOKE EXECUTE ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, text, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_meeting_request(uuid, uuid, text, timestamptz, timestamptz, text, text, text, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_meeting_request(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_meeting_request(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.approve_meeting_request(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_meeting_request(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reject_meeting_request(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reject_meeting_request(uuid, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.suggest_reschedule(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.suggest_reschedule(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.detect_meeting_conflicts(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.detect_meeting_conflicts(uuid, timestamptz, timestamptz, uuid) TO authenticated;

-- Helpers (RLS policy support) — anon nunca deveria chamar
REVOKE EXECUTE ON FUNCTION public.eqr_get_member_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.eqr_get_member_id() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.eqr_is_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.eqr_is_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.eqr_get_member_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.eqr_get_member_role() TO authenticated;

-- public_* functions: KEEP anon (intencional pro form publico /agendar)
-- Nao mexer em:
-- - public_create_meeting_request
-- - public_get_partner_availability
-- - public_list_partners

COMMENT ON FUNCTION public.create_meeting_request IS
  'v2 (migration 0019): cria meeting_request + audit "created". SECURITY DEFINER, restricted to authenticated (0023).';
