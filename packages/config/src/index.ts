export * from './members';
export * from './env';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export const WORKING_HOURS = {
  start: '08:00',
  end: '18:00',
} as const;

export const SYNC_RETRY_LIMIT = 5;
export const SYNC_RETRY_DELAY_BASE_MS = 60_000;

export const REALTIME_CHANNELS = {
  events: (memberId: string) => `events:${memberId}`,
  notifications: (memberId: string) => `notifications:${memberId}`,
  adminGlobal: 'admin:global',
} as const;

export const APP_ROLES = {
  admin: 'admin',
  member: 'member',
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];
