# EQR Agenda Master

Central corporativa inteligente de gerenciamento de agendas da EQR.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14, React, TailwindCSS, Framer Motion, shadcn/ui |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Automação | N8N (self-hosted, queue mode) |
| Integração | Microsoft Outlook Calendar (Microsoft Graph API) |
| Monorepo | Turborepo |

## Membros e Cores

| Membro | Cor | Hex |
|--------|-----|-----|
| Aluisio | Azul | `#3B82F6` |
| Henrique | Verde | `#22C55E` |
| Kadu | Roxo | `#A855F7` |
| Wesley | Laranja | `#F97316` |

## Estrutura do Projeto

```
eqr-agenda-master/
├── apps/
│   └── web/              # Next.js 14 App (frontend)
├── packages/
│   ├── config/           # Constantes, variáveis de ambiente
│   ├── domain/           # Entidades, interfaces (puro TypeScript)
│   ├── database/         # Tipos Supabase, repositories
│   └── services/         # Lógica de negócio (EventService, ConflictService, ...)
├── supabase/
│   ├── migrations/       # 8 migrations SQL (run em ordem)
│   ├── functions/        # Edge Functions (trigger-n8n-webhook, conflict-detector)
│   └── seed.sql          # Dados de desenvolvimento
└── n8n/
    └── workflows/        # 8 workflows JSON para importar no N8N
```

## Setup Rápido

### 1. Pré-requisitos

- Node.js 20+
- Conta Supabase (supabase.com)
- Conta Google Cloud (para Calendar API)
- Instância N8N (Docker recomendado)

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp apps/web/.env.example apps/web/.env.local
# Edite com seus valores
```

### 4. Aplicar migrations Supabase

```bash
# Via Supabase CLI
supabase db push

# Ou cole cada arquivo de supabase/migrations/ no SQL Editor do Dashboard
```

### 5. Aplicar seed (desenvolvimento)

Crie os 5 usuários no Supabase Auth Dashboard primeiro, anote os UUIDs, substitua no `supabase/seed.sql` e execute.

### 6. Deploy das Edge Functions

```bash
supabase functions deploy trigger-n8n-webhook
supabase functions deploy conflict-detector
supabase functions deploy verify-n8n-inbound

# Configurar secrets
supabase secrets set N8N_WEBHOOK_SECRET=seu-secret
supabase secrets set N8N_BASE_URL=https://seu-n8n.com
```

### 7. Iniciar desenvolvimento

```bash
npm run dev
# App disponível em http://localhost:3000
```

### 8. Importar workflows N8N

1. Acesse sua instância N8N
2. Importe os 8 arquivos de `n8n/workflows/`
3. Configure credenciais Google OAuth2
4. Ative todos os workflows

## Segurança

- **RLS**: Todas as tabelas com Row Level Security
- **RBAC**: Admin vê tudo; Member vê apenas seus próprios dados
- **HMAC**: Todos os webhooks N8N assinados
- **Auditoria**: Log imutável de todas as ações
- **Criptografia**: Tokens Google encriptados com pgcrypto

## Arquitetura de Sincronização

```
Admin cria evento
       │
       ▼
  Supabase INSERT
       │
       ▼
  Database Webhook
       │
       ▼
  Edge Function (assina payload HMAC)
       │
       ▼
  N8N Workflow 01 (async)
       │
       ▼
  Google Calendar API
       │
       ▼
  N8N atualiza sync_status → 'synced'
       │
       ▼
  Supabase Realtime → Frontend (SyncStatusBadge atualiza)
```

## Roadmap

- [x] Fase 0: Monorepo, Supabase schema, auth
- [x] Fase 1: Core calendar CRUD
- [x] Fase 2: Drag-and-drop, Realtime
- [ ] Fase 3: Google Calendar sync completo
- [ ] Fase 4: Recorrências, notificações email
- [ ] Fase 5: Admin dashboard completo, auditoria
- [ ] Fase 6: Testes E2E, hardening, production deploy
