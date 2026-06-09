'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Link2, Trash2, AlertCircle, CheckCircle2, Send, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Conector de SMTP simplificado pro admin.
 *
 * Server fixo (atlanta.meuemail.net.br:465 SSL) porque todo @eqr.com.br mora lá.
 * Admin só preenche: usuário (email) + senha. Tudo o resto é constante.
 *
 * Se um dia precisar mudar provider SMTP (ex: M365, Gmail), edita as
 * SERVER_* constantes ou adiciona toggle pra modo avançado.
 *
 * Fluxo:
 *   1. Admin preenche email + senha
 *   2. POST /api/admin/email-smtp envia tudo (server fixo + email/senha)
 *   3. POST /api/admin/email-smtp/test valida conexão + envia teste pro próprio admin
 *   4. Se passou, marca verified_at — sistema usa SMTP em vez de Resend
 */

// === Constantes hardcoded do servidor meuemail.net.br ===
const SERVER_HOST = 'atlanta.meuemail.net.br';
const SERVER_PORT = 465;
const SERVER_SECURE = true; // SSL/TLS
const DEFAULT_FROM_NAME = 'EQR Agenda';

interface SmtpStatus {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  fromAddress?: string;
  fromName?: string;
  verifiedAt?: string | null;
  lastTestError?: string | null;
  updatedAt?: string;
  passwordConfigured?: boolean;
}

interface Props {
  isAdmin: boolean;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const last = new Date(iso).getTime();
  if (Number.isNaN(last)) return 'nunca';
  const diffMs = Date.now() - last;
  if (diffMs < 60_000) return 'agora há pouco';
  if (diffMs < 3_600_000) return `há ${Math.floor(diffMs / 60_000)}min`;
  if (diffMs < 86_400_000) return `há ${Math.floor(diffMs / 3_600_000)}h`;
  return `há ${Math.floor(diffMs / 86_400_000)} dias`;
}

export function EmailConnectorSection({ isAdmin }: Props) {
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Apenas 2 campos editáveis pelo admin
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [isAdmin]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-smtp');
      if (!res.ok) throw new Error('Erro ao carregar');
      const data = (await res.json()) as SmtpStatus;
      setStatus(data);
      if (data.configured) {
        setUsername(data.username ?? '');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError(null);
    const u = username.trim();
    if (!u) {
      setError('Preencha o email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)) {
      setError('Email inválido');
      return;
    }
    if (!status?.configured && !password) {
      setError('Senha é obrigatória no primeiro cadastro');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        host: SERVER_HOST,
        port: SERVER_PORT,
        secure: SERVER_SECURE,
        username: u,
        fromAddress: u, // self-relay: from = user
        fromName: DEFAULT_FROM_NAME,
      };
      if (password) payload.password = password;

      const res = await fetch('/api/admin/email-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Erro ao salvar');
        return;
      }
      toast.success('Salvo. Clique em "Testar" pra validar.');
      setPassword('');
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setError(null);
    setTesting(true);
    try {
      const res = await fetch('/api/admin/email-smtp/test', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        stage?: string;
        sentTo?: string;
      };
      if (!res.ok || !data.ok) {
        const stageLabel =
          data.stage === 'verify' ? 'conexão' : data.stage === 'send' ? 'envio' : 'teste';
        const msg = `Falha no ${stageLabel}: ${data.error ?? 'erro desconhecido'}`;
        setError(msg);
        toast.error(msg);
        await load();
        return;
      }
      toast.success(`Teste enviado pra ${data.sentTo}. Olha sua caixa de entrada.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Remover SMTP? O sistema volta a usar Resend (fallback).')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/admin/email-smtp', { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Erro ao remover');
        return;
      }
      toast.success('SMTP removido');
      setStatus({ configured: false });
      setEditing(false);
      setUsername('');
      setPassword('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setDisconnecting(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.26 }}
      className="bg-surface-elevated border border-surface-border rounded-xl px-5"
    >
      <div className="py-4 border-b border-surface-border">
        <h2 className="text-text-secondary text-sm font-medium flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Email de convites (.ics)
        </h2>
      </div>

      <div className="py-4 space-y-3">
        {loading ? (
          <p className="text-xs text-text-muted">Carregando…</p>
        ) : status?.configured && !editing ? (
          <ConnectedView
            status={status}
            onEdit={() => setEditing(true)}
            onTest={() => void handleTest()}
            onDisconnect={() => void handleDisconnect()}
            testing={testing}
            disconnecting={disconnecting}
          />
        ) : (
          <SimpleForm
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            saving={saving}
            error={error}
            isEdit={Boolean(status?.configured)}
            onSave={() => void handleSave()}
            onCancel={
              status?.configured
                ? () => {
                    setEditing(false);
                    setError(null);
                    setPassword('');
                    if (status) {
                      setUsername(status.username ?? '');
                    }
                  }
                : null
            }
          />
        )}
      </div>
    </motion.div>
  );
}

function ConnectedView({
  status,
  onEdit,
  onTest,
  onDisconnect,
  testing,
  disconnecting,
}: {
  status: SmtpStatus;
  onEdit: () => void;
  onTest: () => void;
  onDisconnect: () => void;
  testing: boolean;
  disconnecting: boolean;
}) {
  const verified = Boolean(status.verifiedAt);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {verified ? (
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-text-primary truncate">
            {verified ? 'Conectado e verificado' : 'Salvo — precisa testar'}
          </span>
        </div>
        <span className="text-[10px] text-text-muted whitespace-nowrap">
          {verified ? `verificado ${formatRelative(status.verifiedAt)}` : 'não verificado'}
        </span>
      </div>

      <div className="text-xs text-text-muted space-y-1 pl-1">
        <div>
          <span className="text-text-secondary">Email:</span> {status.username}
        </div>
        <div>
          <span className="text-text-secondary">Remetente:</span> {status.fromName} &lt;
          {status.fromAddress}&gt;
        </div>
      </div>

      {status.lastTestError && (
        <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Última falha: {status.lastTestError}</span>
        </div>
      )}

      {!verified && (
        <p className="text-[11px] text-text-muted leading-relaxed">
          Enquanto não passar no teste, os convites continuam saindo pelo Resend (sandbox). Clique
          em <strong>Testar conexão</strong> pra ativar.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onTest}
          disabled={testing || disconnecting}
          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
          style={{ color: '#0D1B2A' }}
        >
          <Send className="w-3.5 h-3.5" />
          {testing ? 'Enviando…' : 'Testar conexão'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={testing || disconnecting}
          className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-primary text-sm hover:border-accent transition-colors disabled:opacity-50"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={testing || disconnecting}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-danger hover:bg-danger/10 border border-danger/30 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {disconnecting ? 'Removendo…' : 'Remover'}
        </button>
      </div>

      <details className="text-[10px] text-text-muted/70 pt-1">
        <summary className="cursor-pointer hover:text-text-muted">Configuração do servidor</summary>
        <div className="mt-1 pl-2 font-mono">
          {SERVER_HOST}:{SERVER_PORT} · SSL/TLS
        </div>
      </details>
    </div>
  );
}

interface SimpleFormProps {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  isEdit: boolean;
  onSave: () => void;
  onCancel: (() => void) | null;
}

function SimpleForm(p: SimpleFormProps) {
  const inputClass =
    'w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors';

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted leading-relaxed">
        Use seu email @eqr.com.br pra enviar convites de reunião automaticamente.
      </p>

      <div className="space-y-2">
        <label className="text-[11px] text-text-secondary font-medium">Usuário</label>
        <input
          type="email"
          value={p.username}
          onChange={(e) => p.setUsername(e.target.value)}
          placeholder="seu@eqr.com.br"
          className={inputClass}
          disabled={p.saving}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] text-text-secondary font-medium">
          Senha {p.isEdit && <span className="text-text-muted">(em branco mantém a atual)</span>}
        </label>
        <div className="relative">
          <input
            type={p.showPassword ? 'text' : 'password'}
            value={p.password}
            onChange={(e) => p.setPassword(e.target.value)}
            placeholder={p.isEdit ? '••••••••• (sem alterar)' : 'senha do email'}
            className={inputClass + ' pr-10'}
            disabled={p.saving}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => p.setShowPassword(!p.showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            tabIndex={-1}
          >
            {p.showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {p.error && (
        <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{p.error}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={p.onSave}
          disabled={p.saving}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
          style={{ color: '#0D1B2A' }}
        >
          <Link2 className="w-3.5 h-3.5" />
          {p.saving ? 'Salvando…' : p.isEdit ? 'Atualizar' : 'Salvar'}
        </button>
        {p.onCancel && (
          <button
            type="button"
            onClick={p.onCancel}
            disabled={p.saving}
            className="px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-secondary text-sm hover:text-text-primary transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>

      <details className="text-[10px] text-text-muted/70 pt-1">
        <summary className="cursor-pointer hover:text-text-muted">
          Servidor pré-configurado
        </summary>
        <div className="mt-1 pl-2 font-mono">
          {SERVER_HOST}:{SERVER_PORT} · SSL/TLS
        </div>
      </details>
    </div>
  );
}
