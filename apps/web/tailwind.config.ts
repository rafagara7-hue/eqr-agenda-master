import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // EQR dark surfaces — inspirado em Linear/Vercel
        surface: {
          base: 'rgb(var(--surface-base-rgb) / <alpha-value>)',
          elevated: 'rgb(var(--surface-elevated-rgb) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay-rgb) / <alpha-value>)',
          border: 'rgb(var(--surface-border-rgb) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted-rgb) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        },
        // Cores dos membros
        member: {
          blue: {
            DEFAULT: '#3B82F6',
            light: '#DBEAFE',
            dark: '#1D4ED8',
            subtle: 'rgba(59,130,246,0.15)',
          },
          green: {
            DEFAULT: '#22C55E',
            light: '#DCFCE7',
            dark: '#15803D',
            subtle: 'rgba(34,197,94,0.15)',
          },
          purple: {
            DEFAULT: '#A855F7',
            light: '#F3E8FF',
            dark: '#7E22CE',
            subtle: 'rgba(168,85,247,0.15)',
          },
          orange: {
            DEFAULT: '#F97316',
            light: '#FFEDD5',
            dark: '#C2410C',
            subtle: 'rgba(249,115,22,0.15)',
          },
        },
        // Cores semânticas
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#3B82F6',
        favorite: '#C9A84C',
        // Supabase Realtime status
        sync: {
          pending: '#F59E0B',
          synced: '#22C55E',
          failed: '#EF4444',
          conflict: '#F97316',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(59,130,246,0.3)',
        'glow-green': '0 0 20px rgba(34,197,94,0.3)',
        'glow-purple': '0 0 20px rgba(168,85,247,0.3)',
        'glow-orange': '0 0 20px rgba(249,115,22,0.3)',
        card: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.5)',
        modal: '0 25px 50px rgba(0,0,0,0.8)',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-bottom': 'slide-in-bottom 0.3s cubic-bezier(0.16,1,0.3,1)',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'now-line': 'now-line 60s linear infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-in-bottom': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'now-line': {
          '0%': { opacity: '1' },
          '50%': { opacity: '0.7' },
          '100%': { opacity: '1' },
        },
      },
      spacing: {
        sidebar: '240px',
        'top-bar': '56px',
        'side-panel': '380px',
      },
    },
  },
  plugins: [],
};

export default config;
