import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MIMO AGENT', template: '%s · MIMO AGENT' },
  description: 'Your Intelligent AI. Your Digital Workforce.',
  icons: { icon: '/icon.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0a0c11', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('mimo_theme')?.value;
  const cls = theme === 'light' ? 'light' : 'dark';
  return (
    <html lang="en" className={cls} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
