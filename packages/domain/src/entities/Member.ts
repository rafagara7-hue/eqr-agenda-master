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
  googleLinked: boolean;
  createdAt: Date;
  updatedAt: Date;
}
