import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { MotionProvider } from '@/components/motion/motion-provider';
import { APP_NAME } from '@/lib/config';

// Self-hosted at build time by next/font: no requests to Google from the browser.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const display = Space_Grotesk({
  variable: '--font-display-face',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Event ticketing with fair queuing and live seat availability.',
};

export const viewport: Viewport = {
  themeColor: '#07070c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} h-full antialiased`}>
      <body className="bg-canvas text-body flex min-h-full flex-col">
        <a
          href="#content"
          className="rounded-btn bg-ink text-on-light sr-only z-[60] px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <MotionProvider>
          <SiteHeader />
          <div id="content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
            {children}
          </div>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
