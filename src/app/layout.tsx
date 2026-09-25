import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Taleweaver', template: '%s · Taleweaver' },
  description: 'Solo tabletop adventures with an AI Dungeon Master',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0c0a09' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
