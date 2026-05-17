-- Migration: 0007_rls_policies
-- ARQUIVO CRÍTICO: todas as políticas de segurança Row Level Security

-- ============================================================
-- Funções helper (chamadas pelas policies — cached por query)
-- ============================================================

CREATE OR REPLACE FUNCTION public.eqr_get_member_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.members WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.eqr_is_admin()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.members
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active = TRUE
  );
$$;

-- ============================================================
-- MEMBERS
-- ============================================================

CREATE POLICY "members_select_own_or_admin"
  ON public.members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.eqr_is_admin());

CREATE POLICY "members_update_admin_only"
  ON public.members FOR UPDATE
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

-- INSERT/DELETE apenas via service_role (seed, migrations)

-- ============================================================
-- EVENTS
-- ============================================================

CREATE POLICY "events_select_own_or_admin"
  ON public.events FOR SELECT
  TO authenticated
  USING (member_id = public.eqr_get_member_id() OR public.eqr_is_admin());

CREATE POLICY "events_insert_admin_only"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (public.eqr_is_admin());

CREATE POLICY "events_update_admin_only"
  ON public.events FOR UPDATE
  TO authenticated
  USING (public.eqr_is_admin())
  WITH CHECK (public.eqr_is_admin());

CREATE POLICY "events_delete_admin_only"
  ON public.events FOR DELETE
  TO authenticated
  USING (public.eqr_is_admin());

-- ============================================================
-- RECURRENCE RULES
-- ============================================================

CREATE POLICY "recurrence_select_authenticated"
  ON public.recurrence_rules FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "recurrence_insert_admin_only"
  ON public.recurrence_rules FOR INSERT
  TO authenticated
  WITH CHECK (public.eqr_is_admin());

CREATE POLICY "recurrence_update_admin_only"
  ON public.recurrence_rules FOR UPDATE
  TO authenticated
  USING (public.eqr_is_admin());

-- ============================================================
-- GOOGLE CALENDAR ACCOUNTS
-- ============================================================

CREATE POLICY "gca_select_own_or_admin"
  ON public.google_calendar_accounts FOR SELECT
  TO authenticated
  USING (member_id = public.eqr_get_member_id() OR public.eqr_is_admin());

CREATE POLICY "gca_insert_admin_only"
  ON public.google_calendar_accounts FOR INSERT
  TO authenticated
  WITH CHECK (public.eqr_is_admin());

CREATE POLICY "gca_update_admin_only"
  ON public.google_calendar_accounts FOR UPDATE
  TO authenticated
  USING (public.eqr_is_admin());

CREATE POLICY "gca_delete_admin_only"
  ON public.google_calendar_accounts FOR DELETE
  TO authenticated
  USING (public.eqr_is_admin());

-- ============================================================
-- CONFLICTS
-- ============================================================

CREATE POLICY "conflicts_select_own_or_admin"
  ON public.conflicts FOR SELECT
  TO authenticated
  USING (member_id = public.eqr_get_member_id() OR public.eqr_is_admin());

CREATE POLICY "conflicts_update_admin_only"
  ON public.conflicts FOR UPDATE
  TO authenticated
  USING (public.eqr_is_admin());

-- ============================================================
-- EVENT SYNC LOG
-- ============================================================

CREATE POLICY "esl_select_admin_only"
  ON public.event_sync_log FOR SELECT
  TO authenticated
  USING (public.eqr_is_admin());

-- ============================================================
-- AUDIT LOGS (imutável — sem DELETE policy)
-- ============================================================

CREATE POLICY "audit_select_admin_only"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.eqr_is_admin());

CREATE POLICY "audit_insert_authenticated"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = public.eqr_get_member_id() OR public.eqr_is_admin());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (member_id = public.eqr_get_member_id());

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (member_id = public.eqr_get_member_id());

-- ============================================================
-- APP SETTINGS
-- ============================================================

CREATE POLICY "app_settings_select_authenticated"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "app_settings_update_admin_only"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.eqr_is_admin());
