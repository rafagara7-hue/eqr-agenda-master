-- Seed: EQR Agenda Master
-- UUIDs de auth.users criados via Admin API em 2026-05-16

INSERT INTO public.members (id, user_id, name, slug, color, color_hex, role) VALUES
  (
    'b1000000-0000-0000-0000-000000000001',
    '707b07b0-ab20-443e-aecd-ad69edd10fc0',
    'Admin EQR', 'admin', 'gray', '#6B7280', 'admin'
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    'c5cd42ee-afe1-4074-bf03-60c73c3cb400',
    'Aluisio', 'aluisio', 'blue', '#3B82F6', 'member'
  ),
  (
    'b3000000-0000-0000-0000-000000000003',
    '7908ea4e-42ae-423e-8123-57d910a0e57f',
    'Henrique', 'henrique', 'green', '#22C55E', 'member'
  ),
  (
    'b4000000-0000-0000-0000-000000000004',
    '2fe96970-4c72-4f50-ad3c-ddafc28bd0d1',
    'Kadu', 'kadu', 'purple', '#A855F7', 'member'
  ),
  (
    'b5000000-0000-0000-0000-000000000005',
    'f356a11c-72ca-484f-ae58-49fb7cfa8105',
    'Wesley', 'wesley', 'orange', '#F97316', 'member'
  )
ON CONFLICT (slug) DO NOTHING;

-- Eventos de exemplo para testar o sistema
INSERT INTO public.events (member_id, created_by, title, description, start_at, end_at, sync_status) VALUES
  (
    'b2000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000001',
    'Reunião de Kickoff',
    'Alinhamento inicial do projeto EQR',
    NOW() + INTERVAL '1 day' + INTERVAL '9 hours',
    NOW() + INTERVAL '1 day' + INTERVAL '10 hours',
    'local_only'
  ),
  (
    'b3000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000001',
    'Sprint Review',
    'Revisão da sprint com o time',
    NOW() + INTERVAL '2 days' + INTERVAL '14 hours',
    NOW() + INTERVAL '2 days' + INTERVAL '15 hours',
    'local_only'
  ),
  (
    'b4000000-0000-0000-0000-000000000004',
    'b1000000-0000-0000-0000-000000000001',
    '1:1 com o CEO',
    NULL,
    NOW() + INTERVAL '3 days' + INTERVAL '10 hours',
    NOW() + INTERVAL '3 days' + INTERVAL '10 hours 30 minutes',
    'local_only'
  ),
  (
    'b5000000-0000-0000-0000-000000000005',
    'b1000000-0000-0000-0000-000000000001',
    'Apresentação de Resultados',
    'Apresentação mensal para diretoria',
    NOW() + INTERVAL '5 days' + INTERVAL '15 hours',
    NOW() + INTERVAL '5 days' + INTERVAL '17 hours',
    'local_only'
  )
ON CONFLICT DO NOTHING;
