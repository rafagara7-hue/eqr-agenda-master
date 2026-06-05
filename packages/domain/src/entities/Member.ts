export type MemberRole = 'admin' | 'member';

export interface Member {
  id: string;
  userId: string;
  name: string;
  slug: string;
  color: string;
  colorHex: string;
  role: MemberRole;
  isActive: boolean;
  avatarUrl: string | null;
  /** Indica se o member tem algum calendário externo (Google ou Microsoft) vinculado via OAuth. */
  calendarLinked: boolean;
  createdAt: Date;
  updatedAt: Date;
}
