import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { THEME_SCRIPT } from '@/lib/theme';

/*
 * Self-hosted variable fonts (no Google Fonts request at runtime).
 *
 * Lexend  -> display/headings: geometric, low-strain to read, corporate.
 * Source Sans 3 -> interface/body/table text: the workhorse for dense data.
 *
 * Both ship a single latin subset covering weights 100-900 (Lexend) and
 * 200-900 (Source Sans 3), so we declare the range rather than fixed weights.
 */
const lexend = localFont({
  src: './fonts/lexend-latin.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-lexend',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
  preload: true,
});

const sourceSans = localFont({
  src: './fonts/source-sans-3-latin.woff2',
  weight: '200 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-source-sans',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: 'StockSense — Inventory Management',
    template: '%s · StockSense',
  },
  description:
    'StockSense is a real-time inventory management system for receipts, deliveries, internal transfers, adjustments and a full stock ledger.',
  applicationName: 'StockSense',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#022c22' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sourceSans.variable} ${lexend.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
