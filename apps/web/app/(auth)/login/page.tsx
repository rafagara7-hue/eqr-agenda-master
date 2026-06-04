'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { EqrLogo } from '@/components/shared/EqrLogo';
import { useTranslation } from '@/lib/i18n';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const { t } = useTranslation();

  async function signInAndRedirect(emailToUse: string, passwordToUse: string) {
    setError(null);
    setIsLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: passwordToUse,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError(t('login.sessionError'));
      setIsLoading(false);
      return;
    }

    const { data: memberRow, error: memberError } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      setError(`${t('login.memberError')} ${memberError.message}`);
      setIsLoading(false);
      return;
    }

    const role = (memberRow as { role?: string } | null)?.role;
    const destination =
      role === 'admin'    ? '/admin'
      : role === 'employee' ? '/staff'
      : '/calendar';
    router.push(destination);
    router.refresh();
  }

  /** Aceita 'aluisio' OU 'aluisio@eqr.com.br'. Se faltar o @, completa com @eqr.com.br. */
  function resolveEmail(input: string): string {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;
    return `${trimmed}@eqr.com.br`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signInAndRedirect(resolveEmail(email), password);
  }

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      {/* Background gradient — tons EQR (dourado + azul-noite profundo) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-surface-muted/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <EqrLogo className="w-24 h-24 rounded-2xl mb-5 shadow-lg ring-1 ring-accent/20" />
          <h1 className="text-2xl font-semibold text-text-primary">{t('login.title')}</h1>
          <p className="text-text-muted text-sm mt-1">{t('login.subtitle')}</p>
        </div>

        {/* Card */}
        <div className="bg-surface-elevated border border-surface-border rounded-xl p-6 shadow-modal">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-text-secondary">
                {t('login.username')}
              </label>
              <input
                id="username"
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="aluisio"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-surface-overlay border border-surface-border
                           text-text-primary placeholder-text-muted text-sm
                           focus:outline-none focus:border-member-blue focus:ring-1 focus:ring-member-blue/30
                           transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-text-secondary">
                {t('login.password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-surface-overlay border border-surface-border
                           text-text-primary placeholder-text-muted text-sm
                           focus:outline-none focus:border-member-blue focus:ring-1 focus:ring-member-blue/30
                           transition-colors"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-danger text-sm bg-danger/10 border border-danger/20 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg bg-member-blue hover:bg-member-blue-dark
                         text-white font-medium text-sm transition-all duration-150
                         disabled:opacity-50 disabled:cursor-not-allowed
                         active:scale-[0.98]"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('login.submitting')}
                </span>
              ) : (
                t('login.submit')
              )}
            </button>
          </form>

          {/* Acesso rápido — remover antes do deploy */}
          <div className="mt-4 pt-4 border-t border-surface-border">
            <p className="text-text-muted text-[11px] text-center mb-2 uppercase tracking-wider">{t('login.quickAccess')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Admin', email: 'admin@eqr.com.br', password: 'EqrAdmin@2026!' },
                { label: 'Aluisio', email: 'aluisio@eqr.com.br', password: 'eqr001' },
                { label: 'Henrique', email: 'henrique@eqr.com.br', password: 'eqr002' },
                { label: 'Kadu', email: 'kadu@eqr.com.br', password: 'eqr003' },
                { label: 'Wesley', email: 'wesley@eqr.com.br', password: 'eqr004' },
              ].map((u) => (
                <button
                  key={u.email}
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setEmail(u.email);
                    setPassword(u.password);
                    void signInAndRedirect(u.email, u.password);
                  }}
                  className="py-1.5 px-2 rounded-md bg-surface-overlay hover:bg-surface-muted border border-surface-border
                             text-text-secondary hover:text-text-primary text-xs font-medium transition-colors text-left truncate
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          {t('login.footer')}
        </p>
      </motion.div>
    </div>
  );
}
