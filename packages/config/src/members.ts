export const MEMBERS = [
  {
    slug: 'aluisio',
    name: 'Aluisio',
    color: 'blue',
    colorHex: '#3B82F6',
    colorLight: '#DBEAFE',
    colorDark: '#1D4ED8',
  },
  {
    slug: 'henrique',
    name: 'Henrique',
    color: 'green',
    colorHex: '#22C55E',
    colorLight: '#DCFCE7',
    colorDark: '#15803D',
  },
  {
    slug: 'kadu',
    name: 'Kadu',
    color: 'purple',
    colorHex: '#A855F7',
    colorLight: '#F3E8FF',
    colorDark: '#7E22CE',
  },
  {
    slug: 'wesley',
    name: 'Wesley',
    color: 'orange',
    colorHex: '#F97316',
    colorLight: '#FFEDD5',
    colorDark: '#C2410C',
  },
] as const;

export type MemberSlug = (typeof MEMBERS)[number]['slug'];
export type MemberColor = (typeof MEMBERS)[number]['color'];

export const MEMBER_MAP = Object.fromEntries(
  MEMBERS.map((m) => [m.slug, m])
) as Record<MemberSlug, (typeof MEMBERS)[number]>;

export const MEMBER_COLOR_MAP: Record<MemberSlug, string> = {
  aluisio: '#3B82F6',
  henrique: '#22C55E',
  kadu: '#A855F7',
  wesley: '#F97316',
};

export const GOOGLE_COLOR_MAP: Record<string, number> = {
  '#3B82F6': 9,  // Blueberry
  '#22C55E': 2,  // Sage
  '#A855F7': 3,  // Grape
  '#F97316': 6,  // Tangerine
};
