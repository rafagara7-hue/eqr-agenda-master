-- Migration: 0006_init_notifications
-- Sistema de notificações em tempo real

CREATE TABLE public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id  UUID        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN (
               'event_created', 'event_updated', 'event_deleted',
               'conflict_detected', 'sync_failed', 'reminder', 'google_sync_complete'
             )),
  title      TEXT        NOT NULL,
  body       TEXT,
  event_id   UUID        REFERENCES public.events(id) ON DELETE CASCADE,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at    TIMESTAMPTZ,
  metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_member_unread ON public.notifications(member_id, created_at DESC)
  WHERE read = FALSE;
CREATE INDEX idx_notif_member_all    ON public.notifications(member_id, created_at DESC);

-- Configurações globais da aplicação
CREATE TABLE public.app_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_settings (key, value, description) VALUES
  ('default_timezone',     '"America/Sao_Paulo"',                                    'Fuso horário padrão de exibição'),
  ('working_hours',        '{"start": "08:00", "end": "18:00"}',                     'Horário de trabalho para dicas visuais'),
  ('reminder_defaults',    '{"minutes_before": [15, 60]}',                           'Lembretes padrão em minutos antes'),
  ('n8n_base_url',         '"https://your-n8n-instance.com"',                        'URL base do N8N (atualizar em produção)'),
  ('sync_retry_limit',     '5',                                                       'Máximo de tentativas de sync'),
  ('conflict_alerts',      '{"slack_enabled": false, "email_enabled": false}',        'Canais de alerta de conflito');

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
