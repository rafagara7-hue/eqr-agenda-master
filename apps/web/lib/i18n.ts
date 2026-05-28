'use client';

import { useAgendaSettings } from '@/hooks/useAgendaSettings';

/**
 * Helper de internacionalização leve baseado em dicionário.
 * Por enquanto cobre os textos da página de Configurações e itens de navegação;
 * vamos expandir progressivamente conforme outras telas sejam traduzidas.
 */

export type Language = 'pt-BR' | 'en-US';

type Dict = Record<string, string>;

const PT_BR: Dict = {
  // Navegação
  'nav.calendar': 'Calendário',
  'nav.general': 'Geral',
  'nav.members': 'Membros',
  'nav.feedback': 'Feedback',
  'nav.settings': 'Configurações',
  'nav.signOut': 'Sair',
  'nav.profile': 'Meu perfil',

  // Configurações — cabeçalho
  'settings.title': 'Configurações',
  'settings.subtitle': 'Preferências pessoais da sua conta',

  // Seções
  'settings.section.appearance': 'Aparência',
  'settings.section.preferences': 'Preferências',
  'settings.section.notifications': 'Notificações',
  'settings.section.workHours': 'Horário de trabalho',

  // Tema (escuro/claro)
  'settings.theme.label': 'Tema',
  'settings.theme.description': 'Altera as cores de toda a interface',
  'settings.theme.dark': 'Escuro',
  'settings.theme.light': 'Claro',

  // Posição da barra
  'settings.sidebar.label': 'Posição da barra lateral',
  'settings.sidebar.description': 'Escolha onde a navegação aparece na tela',
  'settings.sidebar.left': 'Esquerda',
  'settings.sidebar.right': 'Direita',
  'settings.sidebar.top': 'Superior',
  'settings.sidebar.bottom': 'Inferior',
  'settings.sidebar.expand': 'Ampliar — ver todas as posições',
  'settings.sidebar.collapse': 'Recolher',

  // Estilo do layout
  'settings.layoutTheme.label': 'Estilo do layout',
  'settings.layoutTheme.description': 'Identidade visual EQR, tema neutro original ou Pro monocromático',
  'settings.layoutTheme.eqr': 'Tema EQR — azul-noite com acento dourado, identidade da empresa',
  'settings.layoutTheme.original': 'Tema Original — paleta neutra slate + azul, sem branding',
  'settings.layoutTheme.pro': 'Tema Pro — monocromático preto + branco, visual minimalista',

  // Idioma
  'settings.language.label': 'Idioma',
  'settings.language.description': 'Idioma da interface',
  'settings.language.pt-BR': 'Português (Brasil)',
  'settings.language.en-US': 'English (US)',

  // Botões comuns
  'common.save': 'Salvar',
  'common.cancel': 'Cancelar',
  'common.confirm': 'Confirmar',
  'common.delete': 'Apagar',
  'common.connect': 'Conectar',
  'common.disconnect': 'Desvincular',
  'common.loading': 'Carregando...',
};

const EN_US: Dict = {
  // Navigation
  'nav.calendar': 'Calendar',
  'nav.general': 'Overview',
  'nav.members': 'Members',
  'nav.feedback': 'Feedback',
  'nav.settings': 'Settings',
  'nav.signOut': 'Sign out',
  'nav.profile': 'My profile',

  // Settings header
  'settings.title': 'Settings',
  'settings.subtitle': 'Personal preferences for your account',

  // Sections
  'settings.section.appearance': 'Appearance',
  'settings.section.preferences': 'Preferences',
  'settings.section.notifications': 'Notifications',
  'settings.section.workHours': 'Working hours',

  // Theme
  'settings.theme.label': 'Theme',
  'settings.theme.description': 'Changes the colors across the entire interface',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',

  // Sidebar
  'settings.sidebar.label': 'Sidebar position',
  'settings.sidebar.description': 'Choose where navigation appears on the screen',
  'settings.sidebar.left': 'Left',
  'settings.sidebar.right': 'Right',
  'settings.sidebar.top': 'Top',
  'settings.sidebar.bottom': 'Bottom',
  'settings.sidebar.expand': 'Expand — see all positions',
  'settings.sidebar.collapse': 'Collapse',

  // Layout style
  'settings.layoutTheme.label': 'Layout style',
  'settings.layoutTheme.description': 'EQR visual identity, neutral original theme, or monochrome Pro',
  'settings.layoutTheme.eqr': 'EQR theme — night-blue with gold accent, company identity',
  'settings.layoutTheme.original': 'Original theme — neutral slate + blue palette, no branding',
  'settings.layoutTheme.pro': 'Pro theme — monochrome black + white, minimalist look',

  // Language
  'settings.language.label': 'Language',
  'settings.language.description': 'Interface language',
  'settings.language.pt-BR': 'Português (Brazil)',
  'settings.language.en-US': 'English (US)',

  // Common buttons
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.connect': 'Connect',
  'common.disconnect': 'Disconnect',
  'common.loading': 'Loading...',
};

const DICTS: Record<Language, Dict> = {
  'pt-BR': PT_BR,
  'en-US': EN_US,
};

/** Hook que retorna a função `t(key)` no idioma atual. */
export function useTranslation() {
  const { settings } = useAgendaSettings();
  const dict = DICTS[settings.language] ?? PT_BR;
  function t(key: string): string {
    return dict[key] ?? PT_BR[key] ?? key;
  }
  return { t, language: settings.language };
}
