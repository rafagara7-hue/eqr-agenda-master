'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, User, Link2, Link2Off, Camera, Check, X, Phone } from 'lucide-react';
import { MemberAvatar } from '@/components/shared/MemberAvatar';
import { toast } from 'sonner';
import { formatDate } from '@/lib/calendar/dateUtils';
import { formatPhone, maskPhoneInput, validatePhone } from '@/lib/phone';

interface MemberData {
  id: string;
  name: string;
  slug: string;
  color_hex: string;
  avatar_url: string | null;
  role: string;
  calendar_linked: boolean;
  phone: string | null;
  created_at: string;
}

interface MemberProfileClientProps {
  member: MemberData;
  isOwnProfile: boolean;
  isAdmin: boolean;
}

const PRESET_COLORS = ['#3B82F6', '#22C55E', '#A855F7', '#F97316'];

export function MemberProfileClient({ member, isOwnProfile, isAdmin }: MemberProfileClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canEdit = isOwnProfile || isAdmin;

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(member.name);
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url ?? '');
  const [colorHex, setColorHex] = useState(member.color_hex);
  const [phoneInput, setPhoneInput] = useState(formatPhone(member.phone));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);

  // Lê resultado do callback OAuth Microsoft (?microsoft=connected|denied|error&reason=...)
  const searchParams = useSearchParams();
  useEffect(() => {
    const status = searchParams.get('microsoft');
    if (!status) return;
    if (status === 'connected') toast.success('Outlook Calendar conectado');
    else if (status === 'denied') toast.error('Permissão negada na Microsoft');
    else toast.error(`Erro ao conectar (${status}${searchParams.get('reason') ? ': ' + searchParams.get('reason') : ''})`);
    // Limpa o param da URL
    const url = new URL(window.location.href);
    url.searchParams.delete('microsoft');
    url.searchParams.delete('reason');
    router.replace(url.pathname + (url.search || ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleDisconnectCalendar() {
    const confirmMsg = isOwnProfile
      ? 'Desvincular sua conta Outlook? Eventos atuais não serão removidos do Outlook, mas novas alterações deixarão de sincronizar.'
      : `Desvincular o Outlook Calendar de ${member.name}? O sócio precisará reconectar pra voltar a sincronizar.`;
    if (!confirm(confirmMsg)) return;

    setDisconnectingCalendar(true);
    try {
      // Próprio perfil usa /disconnect; admin desvinculando outro usa /admin-disconnect com memberId
      const res = isOwnProfile
        ? await fetch('/api/microsoft/disconnect', { method: 'POST' })
        : await fetch('/api/microsoft/admin-disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberId: member.id }),
          });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Erro ao desvincular');
      }
      toast.success(
        isOwnProfile ? 'Outlook Calendar desvinculado' : `Outlook Calendar de ${member.name} desvinculado`
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao desvincular');
    } finally {
      setDisconnectingCalendar(false);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayMember = {
    name,
    colorHex,
    avatarUrl: avatarUrl || null,
  };

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/members/${member.id}/avatar`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Erro no upload');
      }

      const { url } = await res.json() as { url: string };
      setAvatarUrl(url);
      toast.success('Foto atualizada — clique em Salvar para confirmar');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    const phoneCheck = validatePhone(phoneInput);
    if (!phoneCheck.ok) {
      setPhoneError(phoneCheck.error ?? 'Telefone inválido');
      return;
    }
    setPhoneError(null);

    setSaving(true);
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          avatar_url: avatarUrl || null,
          color_hex: colorHex,
          phone: phoneCheck.value,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? 'Erro ao salvar');
      }
      toast.success('Perfil atualizado');
      setIsEditing(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sidebar-members'] }),
        queryClient.invalidateQueries({ queryKey: ['members-list'] }),
        queryClient.invalidateQueries({ queryKey: ['members-filter-list'] }),
        queryClient.invalidateQueries({ queryKey: ['member-info', member.id] }),
        queryClient.invalidateQueries({ queryKey: ['member-panel', member.id] }),
      ]);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(member.name);
    setAvatarUrl(member.avatar_url ?? '');
    setColorHex(member.color_hex);
    setPhoneInput(formatPhone(member.phone));
    setPhoneError(null);
    setIsEditing(false);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Back */}
      <button
        onClick={() => router.push('/admin/members')}
        className="flex items-center gap-1.5 text-text-muted hover:text-text-secondary transition-colors text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para membros
      </button>

      <div className="max-w-lg space-y-6">
        {/* Card de perfil */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface-elevated border border-surface-border rounded-xl overflow-hidden"
          style={{ borderTopColor: member.color_hex, borderTopWidth: 3 }}
        >
          {/* Avatar + nome */}
          <div className="p-6 flex items-start gap-5">
            {/* Avatar — clicável durante edição */}
            <div className="relative flex-shrink-0">
              {isEditing ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="relative group focus:outline-none"
                  title="Alterar foto"
                >
                  <MemberAvatar
                    member={displayMember}
                    size="lg"
                    className="w-16 h-16 text-xl"
                  />
                  {/* Overlay de hover / loading */}
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                    {uploadingAvatar ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4 text-white" />
                    )}
                  </div>
                </button>
              ) : (
                <MemberAvatar member={displayMember} size="lg" className="w-16 h-16 text-xl" />
              )}

              {/* Input de arquivo oculto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
              />

              {/* Badge de câmera quando em edição (hint visual) */}
              {isEditing && !uploadingAvatar && (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-member-blue border-2 border-surface-elevated flex items-center justify-center pointer-events-none">
                  <Camera className="w-2.5 h-2.5 text-white" />
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-overlay border border-surface-border rounded-lg px-3 py-1.5 text-text-primary text-base font-semibold outline-none focus:border-member-blue transition-colors"
                  placeholder="Nome"
                  autoFocus
                />
              ) : (
                <h2 className="text-text-primary text-xl font-semibold">{name}</h2>
              )}

              <div className="flex items-center gap-1.5 mt-1">
                {member.role === 'admin' ? (
                  <><Shield className="w-3.5 h-3.5 text-member-blue" /><span className="text-member-blue text-xs font-medium">Administrador</span></>
                ) : (
                  <><User className="w-3.5 h-3.5 text-text-muted" /><span className="text-text-muted text-xs capitalize">Membro</span></>
                )}
              </div>

              {/* Hint de upload */}
              {isEditing && (
                <p className="text-text-muted text-[10px] mt-2">
                  Clique na foto para alterar · JPG, PNG, WebP · máx. 2 MB
                </p>
              )}
            </div>
          </div>

          {/* Color picker (edição) */}
          {isEditing && (
            <div className="px-6 pb-4">
              <label className="block text-text-muted text-xs font-medium mb-2">Cor do calendário</label>
              <div className="flex gap-3">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorHex(c)}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-105"
                    style={{
                      backgroundColor: c,
                      transform: colorHex === c ? 'scale(1.15)' : undefined,
                      boxShadow: colorHex === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : 'none',
                    }}
                  >
                    {colorHex === c && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-surface-border" />

          {/* Detalhes */}
          <div className="p-6 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-text-muted">Cor do calendário</span>
              <span
                className="w-4 h-4 rounded-full border border-surface-border"
                style={{ backgroundColor: colorHex }}
                aria-label="Cor selecionada"
              />
            </div>

            {/* Telefone */}
            <div className="flex justify-between items-start gap-3 text-sm py-1">
              <span className="text-text-muted flex items-center gap-1.5 mt-1">
                <Phone className="w-3.5 h-3.5" /> Telefone
              </span>
              {isEditing && canEdit ? (
                <div className="flex flex-col items-end gap-1 min-w-0">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneInput}
                    placeholder="(11) 99999-8888"
                    onChange={(e) => {
                      const masked = maskPhoneInput(e.target.value);
                      setPhoneInput(masked);
                      if (phoneError) setPhoneError(null);
                    }}
                    className="bg-surface-overlay border border-surface-border rounded-md px-2.5 py-1.5 text-text-primary text-sm outline-none focus:border-member-blue transition-colors w-44 text-right"
                  />
                  {phoneError && <span className="text-danger text-xs">{phoneError}</span>}
                </div>
              ) : (
                <span className="text-text-secondary">
                  {member.phone ? formatPhone(member.phone) : 'Não informado'}
                </span>
              )}
            </div>

            {/* Outlook Calendar: só o próprio dono pode conectar/desconectar */}
            <div className="flex justify-between items-center gap-3 text-sm">
              <span className="text-text-muted">Outlook Calendar</span>
              {member.calendar_linked ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <Link2 className="w-3.5 h-3.5" /> Vinculado
                  </span>
                  {(isOwnProfile || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => void handleDisconnectCalendar()}
                      disabled={disconnectingCalendar}
                      className="text-xs text-text-muted hover:text-danger underline underline-offset-2 disabled:opacity-50"
                    >
                      {disconnectingCalendar ? 'Desvinculando…' : 'Desvincular'}
                    </button>
                  )}
                </div>
              ) : isOwnProfile ? (
                <a
                  href="/api/microsoft/connect"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-member-blue hover:underline"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Conectar
                </a>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-text-muted">
                  <Link2Off className="w-3.5 h-3.5" /> Não vinculado
                </span>
              )}
            </div>

            <div className="flex justify-between items-center text-sm">
              <span className="text-text-muted">Membro desde</span>
              <span className="text-text-secondary text-xs">
                {formatDate(new Date(member.created_at), "d 'de' MMMM yyyy")}
              </span>
            </div>
          </div>

          {/* Ações */}
          {canEdit && (
            <>
              <div className="border-t border-surface-border" />
              <div className="p-4 flex justify-end gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-overlay transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Cancelar
                    </button>
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving || !name.trim() || uploadingAvatar}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm bg-member-blue text-white hover:bg-member-blue/90 transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-1.5 rounded-lg text-sm bg-surface-overlay hover:bg-surface-muted transition-colors text-text-secondary"
                  >
                    Editar perfil
                  </button>
                )}
              </div>
            </>
          )}
        </motion.div>

        {/* Atalho para ver no calendário */}
        <button
          onClick={() => router.push(`/calendar?member=${member.id}`)}
          className="w-full flex items-center justify-between px-4 py-3 bg-surface-elevated border border-surface-border rounded-xl text-sm text-text-secondary hover:border-surface-muted hover:text-text-primary transition-all group"
        >
          <span>Ver eventos no calendário</span>
          <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
