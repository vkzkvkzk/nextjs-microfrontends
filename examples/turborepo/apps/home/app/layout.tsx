import type { Metadata } from 'next';
import { MfeDevToolbar } from 'nextjs-microfrontends/next/dev-toolbar';

export const metadata: Metadata = {
  title: 'Home - Microfrontends Example',
  description: 'Next.js microfrontends gateway application'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <nav
          style={{
            display: 'flex',
            gap: '1rem',
            padding: '1rem 2rem',
            background: '#1a1a2e',
            borderBottom: '2px solid #16213e'
          }}>
          <a
            href="/"
            style={{
              color: '#e94560',
              fontWeight: 'bold',
              textDecoration: 'none'
            }}>
            Home
          </a>
          <a href="/blog" style={{ color: '#eee', textDecoration: 'none' }}>
            Blog
          </a>
          <a href="/counter" style={{ color: '#eee', textDecoration: 'none' }}>
            Counter
          </a>
        </nav>
        <main>{children}</main>
        <MfeDevToolbar />
      </body>
    </html>
  );
}
