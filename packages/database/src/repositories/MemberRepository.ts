import type { SupabaseClient } from '@supabase/supabase-js';
import type { Member, IMemberRepository } from '@eqr/domain';
import type { Database } from '../types/supabase.js';

type DbMember = Database['public']['Tables']['members']['Row'];

function toMember(row: DbMember): Member {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    colorHex: row.color_hex,
    role: row.role,
    isActive: row.is_active,
    avatarUrl: row.avatar_url,
    googleLinked: row.google_linked,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class MemberRepository implements IMemberRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<Member | null> {
    const { data, error } = await this.db.from('members').select('*').eq('id', id).single();
    if (error || !data) return null;
    return toMember(data);
  }

  async findByUserId(userId: string): Promise<Member | null> {
    const { data, error } = await this.db.from('members').select('*').eq('user_id', userId).single();
    if (error || !data) return null;
    return toMember(data);
  }

  async findBySlug(slug: string): Promise<Member | null> {
    const { data, error } = await this.db.from('members').select('*').eq('slug', slug).single();
    if (error || !data) return null;
    return toMember(data);
  }

  async findAll(): Promise<Member[]> {
    const { data, error } = await this.db.from('members').select('*').eq('is_active', true).order('name');
    if (error) throw new Error(`MemberRepository.findAll: ${error.message}`);
    return (data ?? []).map(toMember);
  }

  async findAdmins(): Promise<Member[]> {
    const { data, error } = await this.db.from('members').select('*').eq('role', 'admin').eq('is_active', true);
    if (error) throw new Error(`MemberRepository.findAdmins: ${error.message}`);
    return (data ?? []).map(toMember);
  }

  async update(id: string, data: Partial<Member>): Promise<Member> {
    const { data: updated, error } = await this.db
      .from('members')
      .update({
        name: data.name,
        avatar_url: data.avatarUrl,
        google_linked: data.googleLinked,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error || !updated) throw new Error(`MemberRepository.update: ${error?.message}`);
    return toMember(updated);
  }
}
