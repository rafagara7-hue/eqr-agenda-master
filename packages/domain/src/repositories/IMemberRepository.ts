import type { Member } from '../entities/Member.js';

export interface IMemberRepository {
  findById(id: string): Promise<Member | null>;
  findByUserId(userId: string): Promise<Member | null>;
  findBySlug(slug: string): Promise<Member | null>;
  findAll(): Promise<Member[]>;
  findAdmins(): Promise<Member[]>;
  update(id: string, data: Partial<Member>): Promise<Member>;
}
