-- Migration: 0008_realtime_setup
-- Habilita Supabase Realtime nas tabelas necessárias

-- Habilitar publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conflicts;

-- Database Webhooks serão configurados via Supabase Dashboard ou CLI:
--
-- Webhook: events_to_n8n
--   Table: public.events
--   Events: INSERT, UPDATE, DELETE
--   URL: Supabase Edge Function /functions/v1/trigger-n8n-webhook
--   Headers: Authorization: Bearer <service_role_key>
--
-- Webhook: conflicts_to_n8n
--   Table: public.conflicts
--   Events: INSERT
--   URL: N8N Webhook Workflow 05 (conflict notification)
--   Headers: X-EQR-Signature: (computed by edge function)

COMMENT ON TABLE public.events IS
  'Eventos do calendário EQR. Realtime habilitado. Database webhook dispara sync N8N.';

COMMENT ON TABLE public.notifications IS
  'Notificações em tempo real por membro. Realtime habilitado para NotificationBell.';

COMMENT ON TABLE public.conflicts IS
  'Conflitos de agenda detectados pelo conflict-detector edge function.';
