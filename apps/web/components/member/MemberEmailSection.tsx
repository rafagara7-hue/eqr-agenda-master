'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Seção pro sócio (não-admin) confirmar/atualizar o próprio email.
 *
 * Esse email é usado pra:
 *   1. Login (auth.users.email) — sócio vai precisar dele pra entrar de novo
 *   2. Receber convites .ics quando alguém marca reunião com ele
 *
 * Layout proposital simples: 1 campo + 1 botão. Inspirado no SMTP connector
 * do admin (mesmo visual, menos fricção).
 */

interface Props {
  isMember: boolean;
  isAdmin: boolean; // se for admin, não mostra (admin tem outro fluxo)
}

export function MemberEmailSection({ isMember, isAdmin }: Props) {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMember || isAdmin) {
      setLoading(false);
      return;
    }
    void loadCurrent();
  }, [isMember, isAdmin]);

  async function loadCurrent() {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email ?? null;
      setCurrentEmail(email);
      setNewEmail(email ?? '');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar email');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError(null);
    const trimmed = newEmail.trim();
    if (!trimmed) {
      setError('Preencha o email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Email inválido');
      return;
    }
    if (trimmed.toLowerCase() === currentEmail?.toLowerCase()) {
      toast.info('Email não mudou');
      return;
    }

    if (
      !confirm(
        `Confirmar troca de email?\n\nAtual: ${currentEmail ?? '(vazio)'}\nNovo: ${trimmed}\n\n` +
          `IMPORTANTE: seu próximo login vai usar o email novo (com a mesma senha).`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/members/me/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        email?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Erro ao salvar');
        return;
      }
      toast.success(`Email atualizado pra ${data.email}`);
      setCurrentEmail(data.email ?? trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de rede');
    } finally {
      setSaving(false);
    }
  }

  // Só renderiza pra sócio não-admin
  if (!isMember || isAdmin) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
      className="bg-surface-elevated border border-surface-border rounded-xl px-5"
    >
      <div className="py-4 border-b border-surface-border">
        <h2 className="text-text-secondary text-sm font-medium flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Email pra receber convites
        </h2>
      </div>

      <div className="py-4 space-y-3">
        {loading ? (
          <p className="text-xs text-text-muted">Carregando…</p>
        ) : (
          <>
            <p className="text-xs text-text-muted leading-relaxed">
              Confirme o email onde você quer receber convites de reunião. Esse mesmo email
              será usado pra fazer login na próxima vez.
            </p>

            <div className="space-y-2">
              <label className="text-[11px] text-text-secondary font-medium">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setError(null);
                }}
                placeholder="seu@eqr.com.br"
                className="w-full px-3 py-2 bg-surface-base border border-surface-border rounded-lg text-text-primary text-sm placeholder:text-text-muted/60 focus:outline-none focus:border-accent transition-colors"
                disabled={saving}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {currentEmail && newEmail.trim().toLowerCase() !== currentEmail.toLowerCase() && (
              <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-warning/10 border border-warning/30 text-warning text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Atual: <code>{currentEmail}</code>. Salvar vai trocar pra <code>{newEmail.trim()}</code>{' '}
                  — seu próximo login vai precisar do email novo.
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={
                saving ||
                !newEmail.trim() ||
                newEmail.trim().toLowerCase() === currentEmail?.toLowerCase()
              }
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50"
              style={{ color: '#0D1B2A' }}
            >
              {saving ? (
                'Salvando…'
              ) : currentEmail && newEmail.trim().toLowerCase() === currentEmail.toLowerCase() ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Email confirmado
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Salvar
                </>
              )}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
