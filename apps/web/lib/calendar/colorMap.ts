import { MEMBER_COLOR_MAP } from '@eqr/config';

export { MEMBER_COLOR_MAP };

export function getMemberColor(slug: string): string {
  return MEMBER_COLOR_MAP[slug as keyof typeof MEMBER_COLOR_MAP] ?? '#6B7280';
}

export function getMemberColorClass(slug: string): string {
  const map: Record<string, string> = {
    aluisio: 'member-blue',
    henrique: 'member-green',
    kadu: 'member-purple',
    wesley: 'member-orange',
  };
  return map[slug] ?? 'gray';
}

export function getSyncStatusColor(status: string): string {
  const map: Record<string, string> = {
    pending: '#F59E0B',
    synced: '#22C55E',
    failed: '#EF4444',
    conflict: '#F97316',
    local_only: '#71717A',
  };
  return map[status] ?? '#71717A';
}

export function getSyncStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Sincronizando',
    synced: 'Sincronizado',
    failed: 'Falha no sync',
    conflict: 'Conflito',
    local_only: 'Apenas local',
  };
  return map[status] ?? status;
}
