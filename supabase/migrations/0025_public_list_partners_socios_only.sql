-- Restringe public_list_partners() ao role 'member' (socios).
-- O formulario publico /agendar lista os destinatarios escolhiveis;
-- admins (ex.: Amina) nao devem aparecer ali — sao papel administrativo,
-- nao socios que recebem solicitacoes de reuniao.

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
     AND m.role = 'member'
   ORDER BY m.name;
$$;

COMMENT ON FUNCTION public.public_list_partners IS
  'Anon-callable: lista socios ativos (role=member) pro form publico /agendar. Admins nao sao incluidos.';
