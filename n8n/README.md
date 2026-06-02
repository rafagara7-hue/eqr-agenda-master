# N8N Workflows — EQR Agenda Master

## Visão geral

N8N é utilizado **apenas** para automações assíncronas. O Supabase é o backend principal.

## Workflows

| # | Nome | Trigger | Função |
|---|------|---------|--------|
| 01 | Event Create Sync | Webhook POST `/event-create` | Cria evento no Outlook Calendar (Microsoft Graph) |
| 02 | Event Update Sync | Webhook POST `/event-update` | Atualiza evento no Outlook Calendar |
| 03 | Event Delete Sync | Webhook POST `/event-delete` | Remove evento do Outlook Calendar |
| 04 | Microsoft Inbound Sync | Microsoft Graph Notification | Sincroniza mudanças do Outlook para o Supabase |
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
MICROSOFT_PUSH_NOTIFICATION_TOKEN=<token-aleatório (usado como clientState nas subscriptions)>
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
4. Configure as credenciais Microsoft OAuth2 (escopo `Calendars.ReadWrite offline_access`) e o header auth do Supabase
5. Ative todos os workflows

### Registro de Subscription Microsoft Graph

O Workflow 04 depende de subscriptions registradas. Para cada membro:

```bash
POST https://graph.microsoft.com/v1.0/subscriptions
{
  "changeType": "created,updated,deleted",
  "notificationUrl": "https://seu-n8n.com/webhook/microsoft-push",
  "resource": "me/events",
  "expirationDateTime": "2026-01-01T00:00:00.0000000Z",
  "clientState": "${MICROSOFT_PUSH_NOTIFICATION_TOKEN}"
}
```

Salvar `subscription_id` (que é o `subscriptionId` retornado) e `subscription_expiry` em `calendar_provider_accounts`.
A subscription do Microsoft Graph para `/me/events` expira em até 4230 minutos (~70h) e precisa ser renovada via PATCH antes disso. O Workflow 06 renova subscriptions expirando automaticamente.
