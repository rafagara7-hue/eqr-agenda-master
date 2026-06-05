-- ============================================================
-- Migration 0021: public_list_partners — anon callable
-- ============================================================
-- O form publico /agendar precisa listar os socios que podem
-- receber solicitacoes. Mas members RLS so permite SELECT pra
-- authenticated (policy members_select_authenticated em 0017).
--
-- Em vez de afrouxar RLS, expomos so o necessario via uma funcao
-- SECURITY DEFINER que retorna apenas membros ATIVOS com role
-- partner/admin, com colunas estritamente necessarias pro UI.
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_list_partners()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  color_hex text,
  avatar_url text,
  role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT m.id, m.name, m.slug, m.color_hex, m.avatar_url, m.role
    FROM public.members m
   WHERE m.is_active = true
     AND m.role IN ('member', 'admin')
   ORDER BY m.name;
$$;

REVOKE ALL ON FUNCTION public.public_list_partners() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_partners() TO anon, authenticated;

COMMENT ON FUNCTION public.public_list_partners IS
  'Anon-callable: lista socios+admins ativos pro form publico /agendar. Expoe so (id, name, slug, color_hex, avatar_url, role) — sem user_id, telefone, etc.';
