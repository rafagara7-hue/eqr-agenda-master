import type { Metadata } from 'next';
import { Inter, Fragment_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fragmentMono = Fragment_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-fragment-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'EQR Agenda Master',
    template: '%s | EQR Agenda Master',
  },
  description: 'Central corporativa inteligente de gerenciamento de agendas',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('eqr-theme');document.documentElement.classList.add(t==='light'?'light':'dark');})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${fragmentMono.variable} font-sans bg-surface-base text-text-primary antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
