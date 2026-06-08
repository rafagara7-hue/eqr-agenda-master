'use client';

import { useState } from 'react';
import { Copy, Check, RotateCw, Trash2, Calendar, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

/**
 * Seção do perfil do member que gerencia a Subscription URL (calendar_share_token).
 *
 * Mostra:
 *   - Quando token NULL: botão "Gerar URL de compartilhamento"
 *   - Quando token existe: URL completa + Copiar / Regenerar / Revogar
 *
 * Regenerar é "rotate" — gera novo token e invalida o antigo. URLs publicadas
 * em qualquer app (Google/Apple/Outlook) param de funcionar imediatamente.
 *
 * Autorização (backend valida): próprio member OU admin.
 */

interface Props {
  memberId: string;
  initialToken: string | null;
  canManage: boolean; // próprio member ou admin
}

function buildShareUrl(token: string): string {
  if (typeof window === 'undefined') return '';
  const host = window.location.origin;
  return `${host}/api/public/calendar/${token}.ics`;
}

export function CalendarShareSection({ memberId, initialToken, canManage }: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(initialToken);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = token ? buildShareUrl(token) : null;

  async function callShare(action: 'generate' | 'revoke') {
    if (working) return;
    setWorking(true);
    try {
      const res = await fetch('/api/calendar/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, action }),
      });
      const data = (await res.json().catch(() => ({}))) as { token?: string | null; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Erro ao atualizar URL');
        return;
      }
      setToken(data.token ?? null);
      if (action === 'generate') {
        toast.success(token ? 'URL regenerada — antiga revogada' : 'URL de compartilhamento criada');
      } else {
        toast.success('URL revogada');
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro de rede');
    } finally {
      setWorking(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('URL copiada');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar (permissão negada)');
    }
  }

  function handleRegenerate() {
    if (!confirm('Regenerar URL? A URL atual deixa de funcionar e quem tem ela perde acesso. Você precisará adicionar a nova em todos os apps.')) return;
    void callShare('generate');
  }

  function handleRevoke() {
    if (!confirm('Revogar URL? Todos os apps que assinaram essa URL param de receber atualizações.')) return;
    void callShare('revoke');
  }

  if (!canManage) return null;

  return (
    <div className="bg-surface-elevated border border-surface-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-text-muted" />
        <h3 className="text-sm font-medium text-text-primary">Compartilhar agenda</h3>
      </div>

      {!token ? (
        <>
          <p className="text-xs text-text-muted leading-relaxed">
            Gere uma URL única pra adicionar essa agenda em Google Calendar, Apple Calendar,
            Outlook ou qualquer outro app. Os eventos sincronizam automaticamente (read-only).
          </p>
          <button
            type="button"
            onClick={() => void callShare('generate')}
            disabled={working}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
            style={{ color: '#0D1B2A' }}
          >
            <Calendar className="w-3.5 h-3.5" />
            {working ? 'Gerando…' : 'Gerar URL de compartilhamento'}
          </button>
        </>
      ) : (
        <>
          {/* URL display + copy */}
          <div className="space-y-1.5">
            <label className="text-xs text-text-muted">URL de subscription</label>
            <div className="flex gap-1">
              <input
                type="text"
                readOnly
                value={url ?? ''}
                onFocus={(e) => e.target.select()}
                className="flex-1 px-2.5 py-1.5 bg-surface-base border border-surface-border rounded-md text-text-secondary text-xs font-mono outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="px-2.5 py-1.5 rounded-md bg-surface-overlay hover:bg-surface-muted transition-colors text-text-secondary"
                title="Copiar URL"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Como usar */}
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer hover:text-text-secondary font-medium">
              Como adicionar essa URL no calendar
            </summary>
            <div className="mt-2 space-y-2 pl-2">
              <div>
                <strong className="text-text-secondary">Google Calendar:</strong>
                <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
                  <li>calendar.google.com → "+ ao lado de 'Outras agendas'"</li>
                  <li>"Por URL" → cole a URL acima</li>
                </ol>
              </div>
              <div>
                <strong className="text-text-secondary">Apple Calendar (iPhone):</strong>
                <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
                  <li>Configurações → Calendário → Contas → Adicionar Conta</li>
                  <li>Outras → Adicionar Calendário Assinado → cole a URL</li>
                </ol>
              </div>
              <div>
                <strong className="text-text-secondary">Outlook desktop:</strong>
                <ol className="list-decimal list-inside mt-0.5 pl-2 space-y-0.5">
                  <li>Calendário → Página inicial → "Abrir Calendário" → "Da Internet"</li>
                  <li>Cole a URL</li>
                </ol>
              </div>
            </div>
          </details>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={working}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-text-secondary hover:bg-surface-overlay transition-colors disabled:opacity-50"
            >
              <RotateCw className="w-3 h-3" />
              Regenerar
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={working}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Revogar
            </button>
          </div>

          {/* Aviso de privacidade */}
          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-warning/10 border border-warning/20">
            <AlertCircle className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-text-muted leading-snug">
              Qualquer pessoa com essa URL vê seus eventos. Eventos marcados como "privados"
              aparecem só como "[Privado]" sem detalhes.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
