# N8N Workflows — EQR Agenda Master

## Visão geral

N8N é utilizado **apenas** para automações assíncronas. O Supabase é o backend principal.

## Workflows

| # | Nome | Trigger | Função |
|---|------|---------|--------|
| 01 | Event Create Sync | Webhook POST `/event-create` | Cria evento no Google Calendar |
| 02 | Event Update Sync | Webhook POST `/event-update` | Atualiza evento no Google Calendar |
| 03 | Event Delete Sync | Webhook POST `/event-delete` | Remove evento do Google Calendar |
| 04 | Google Inbound Sync | Google Push Notification | Sincroniza mudanças do Google para o Supabase |
| 05 | Conflict Notification | Webhook POST `/conflict-detected` | Notifica admin sobre conflitos |
| 06 | Daily Reconciliation | Cron 03:00 BRT | Reconcilia eventos não sincronizados |
| 07 | Retry Failed Syncs | Cron a cada 15min | Retenta syncs com falha (backoff exponencial) |
| 08 | Reminder Notifications | Cron a cada 1min | Insere lembretes 15min e 1h antes dos eventos |

## Configuração

### Variáveis de ambiente N8N

```env
N8N_WEBHOOK_SECRET=<mínimo 32 chars>
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=https://seu-app.vercel.app
GOOGLE_PUSH_NOTIFICATION_TOKEN=<token-aleatório>
```

### Deploy recomendado

N8N em modo queue (escalável):

```bash
# docker-compose.yml
services:
  n8n:
    image: n8nio/n8n
    environment:
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis
    depends_on: [redis, postgres]
  redis:
    image: redis:7-alpine
```

### Importar workflows

1. Acesse `https://seu-n8n.com`
2. Settings → Import from file
3. Importe cada arquivo `.json` desta pasta
4. Configure as credenciais Google OAuth2 e o header auth do Supabase
5. Ative todos os workflows

### Registro de Push Notification Google

O Workflow 04 depende de canais Watch registrados. Para cada membro:

```bash
POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/watch
{
  "id": "uuid-unico-por-membro",
  "type": "web_hook",
  "address": "https://seu-n8n.com/webhook/google-push",
  "token": "${GOOGLE_PUSH_NOTIFICATION_TOKEN}",
  "expiration": 1704067200000
}
```

Salvar `webhook_channel_id` e `webhook_expiry` em `google_calendar_accounts`.
O Workflow 06 renova canais expirando automaticamente.
