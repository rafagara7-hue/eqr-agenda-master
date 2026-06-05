'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Bug, Lightbulb, CheckCircle2, Clock, XCircle, Eye, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

type FeedbackType = 'error' | 'suggestion';
type FeedbackStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';

interface FeedbackItem {
  id: string;
  member_id: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  members?: { name: string; color_hex: string; avatar_url: string | null } | null;
}

const STATUS_META: Record<FeedbackStatus, { labelKey: string; color: string; Icon: React.ElementType }> = {
  open:      { labelKey: 'feedback.status.open',      color: 'text-warning bg-warning/10 border-warning/30',   Icon: Clock },
  reviewing: { labelKey: 'feedback.status.reviewing', color: 'text-member-blue bg-member-blue/10 border-member-blue/30', Icon: Eye },
  resolved:  { labelKey: 'feedback.status.resolved',  color: 'text-success bg-success/10 border-success/30',    Icon: CheckCircle2 },
  rejected:  { labelKey: 'feedback.status.rejected',  color: 'text-danger bg-danger/10 border-danger/30',       Icon: XCircle },
};

export function FeedbackPanel({ isAdmin, myMemberId }: { isAdmin: boolean; myMemberId: string }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | 'all'>('all');

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ['feedback'],
    queryFn: async () => {
      const res = await fetch('/api/feedback');
      if (!res.ok) throw new Error(t('common.error'));
      const json = await res.json();
      return json.feedback as FeedbackItem[];
    },
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<FeedbackItem, 'status' | 'admin_note'>> }) => {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(t('feedback.updateError'));
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      toast.success(t('feedback.updated'));
    },
    onError: () => toast.error(t('feedback.updateError')),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('feedback.removeError'));
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
      toast.success(t('feedback.removed'));
    },
    onError: () => toast.error(t('feedback.removeError')),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error(t('feedback.fillFields'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title: title.trim(), description: description.trim() }),
      });
      if (!res.ok) throw new Error(t('feedback.sendError'));
      toast.success(t('feedback.sent'));
      setTitle('');
      setDescription('');
      setType('suggestion');
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
    } catch {
      toast.error(t('feedback.sendError'));
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = filterStatus === 'all' ? items : items.filter((f) => f.status === filterStatus);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-text-primary text-xl sm:text-2xl font-semibold">{t('feedback.title')}</h1>
          <p className="text-text-muted text-xs sm:text-sm">
            {isAdmin ? t('feedback.subtitleAdmin') : t('feedback.subtitleMember')}
          </p>
        </div>
      </div>

      {/* Form de envio */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-elevated border border-surface-border rounded-xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType('suggestion')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all',
              type === 'suggestion'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-surface-border bg-surface-overlay text-text-muted hover:text-text-primary'
            )}
          >
            <Lightbulb className="w-4 h-4" />
            {t('feedback.suggestion')}
          </button>
          <button
            type="button"
            onClick={() => setType('error')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all',
              type === 'error'
                ? 'border-danger bg-danger/10 text-danger'
                : 'border-surface-border bg-surface-overlay text-text-muted hover:text-text-primary'
            )}
          >
            <Bug className="w-4 h-4" />
            {t('feedback.error')}
          </button>
        </div>

        <div>
          <label className="text-text-secondary text-xs font-medium block mb-1.5">{t('feedback.formTitle')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'error' ? t('feedback.placeholderTitleError') : t('feedback.placeholderTitleSuggestion')}
            maxLength={200}
            className="w-full px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="text-text-secondary text-xs font-medium block mb-1.5">{t('feedback.formDescription')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === 'error' ? t('feedback.placeholderDescError') : t('feedback.placeholderDescSuggestion')}
            maxLength={4000}
            rows={5}
            className="w-full px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-y"
          />
          <p className="text-text-muted text-[10px] mt-1 text-right">{description.length}/4000</p>
        </div>

        <button
          type="submit"
          disabled={submitting || !title.trim() || !description.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-brand font-medium text-sm hover:bg-accent-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: '#0D1B2A' }}
        >
          <Send className="w-4 h-4" />
          {submitting ? t('common.sending') : t('feedback.send')}
        </button>
      </motion.form>

      {/* Lista */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary text-base sm:text-lg font-semibold">
            {isAdmin
              ? t('feedback.listAdmin', { count: items.length })
              : t('feedback.listMember', { count: items.length })}
          </h2>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FeedbackStatus | 'all')}
            className="px-2 py-1.5 rounded-md bg-surface-overlay border border-surface-border text-text-secondary text-xs focus:outline-none focus:border-accent"
          >
            <option value="all">{t('feedback.statusFilter.all')}</option>
            <option value="open">{t('feedback.statusFilter.open')}</option>
            <option value="reviewing">{t('feedback.statusFilter.reviewing')}</option>
            <option value="resolved">{t('feedback.statusFilter.resolved')}</option>
            <option value="rejected">{t('feedback.statusFilter.rejected')}</option>
          </select>
        </div>

        {isLoading && <p className="text-text-muted text-sm">{t('common.loading')}</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="bg-surface-elevated border border-surface-border rounded-xl p-8 text-center">
            <MessageSquare className="w-10 h-10 text-text-muted mx-auto mb-2 opacity-50" />
            <p className="text-text-muted text-sm">{filterStatus === 'all' ? t('feedback.empty') : t('feedback.emptyFiltered')}</p>
          </div>
        )}

        <AnimatePresence>
          {filtered.map((f) => (
            <FeedbackCard
              key={f.id}
              item={f}
              isAdmin={isAdmin}
              isMine={f.member_id === myMemberId}
              onUpdate={(patch) => updateMut.mutate({ id: f.id, patch })}
              onDelete={() => {
                if (confirm(t('feedback.deleteConfirm'))) deleteMut.mutate(f.id);
              }}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FeedbackCard({
  item,
  isAdmin,
  isMine,
  onUpdate,
  onDelete,
}: {
  item: FeedbackItem;
  isAdmin: boolean;
  isMine: boolean;
  onUpdate: (patch: Partial<Pick<FeedbackItem, 'status' | 'admin_note'>>) => void;
  onDelete: () => void;
}) {
  const { t, language } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [noteDraft, setNoteDraft] = useState(item.admin_note ?? '');
  const StatusIcon = STATUS_META[item.status].Icon;
  const TypeIcon = item.type === 'error' ? Bug : Lightbulb;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-surface-overlay/40 transition-colors text-left"
      >
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
            item.type === 'error' ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'
          )}
        >
          <TypeIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-text-primary text-sm font-medium truncate">{item.title}</p>
            <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border', STATUS_META[item.status].color)}>
              <StatusIcon className="w-3 h-3" />
              {t(STATUS_META[item.status].labelKey)}
            </span>
          </div>
          <p className="text-text-muted text-xs mt-0.5 flex items-center gap-2">
            {isAdmin && item.members && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.members.color_hex }} />
                {item.members.name}
              </span>
            )}
            <span>{new Date(item.created_at).toLocaleString(language, { dateStyle: 'short', timeStyle: 'short' })}</span>
          </p>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-surface-border">
              <p className="text-text-secondary text-sm whitespace-pre-wrap mt-3">{item.description}</p>

              {item.admin_note && (
                <div className="mt-3 p-3 rounded-lg bg-surface-overlay border border-surface-border">
                  <p className="text-accent text-[10px] uppercase tracking-wider font-medium mb-1">{t('feedback.adminResponse')}</p>
                  <p className="text-text-secondary text-sm whitespace-pre-wrap">{item.admin_note}</p>
                </div>
              )}

              {isAdmin && (
                <div className="mt-4 space-y-3 pt-3 border-t border-surface-border">
                  <div>
                    <label className="text-text-secondary text-xs font-medium block mb-1.5">{t('feedback.statusLabel')}</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['open', 'reviewing', 'resolved', 'rejected'] as FeedbackStatus[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onUpdate({ status: s })}
                          className={cn(
                            'py-1.5 rounded-md text-[11px] font-medium border transition-all',
                            item.status === s
                              ? STATUS_META[s].color
                              : 'border-surface-border bg-surface-overlay text-text-muted hover:text-text-primary'
                          )}
                        >
                          {STATUS_META[s].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-text-secondary text-xs font-medium block mb-1.5">{t('feedback.responseLabel')}</label>
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={3}
                      maxLength={4000}
                      placeholder={t('feedback.responsePlaceholder')}
                      className="w-full px-3 py-2 rounded-lg bg-surface-overlay border border-surface-border text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-y"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => onUpdate({ admin_note: noteDraft.trim() || null })}
                        className="px-3 py-1.5 rounded-md bg-accent text-brand text-xs font-medium hover:bg-accent-bright transition-colors"
                        style={{ color: '#0D1B2A' }}
                      >
                        {t('feedback.saveResponse')}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex items-center gap-1.5 text-danger text-xs hover:text-danger/80 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('feedback.deleteCta')}
                  </button>
                </div>
              )}

              {!isAdmin && isMine && (
                <p className="text-text-muted text-[11px] mt-3 italic">
                  {t('feedback.memberHint')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
