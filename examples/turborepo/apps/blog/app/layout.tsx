import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog - Microfrontends Example'
};

export default function BlogLayout({
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
            background: '#0f3460',
            borderBottom: '2px solid #16213e'
          }}>
          <a href="/" style={{ color: '#eee', textDecoration: 'none' }}>
            Home
          </a>
          <a
            href="/blog"
            style={{
              color: '#e94560',
              fontWeight: 'bold',
              textDecoration: 'none'
            }}>
            Blog
          </a>
          <a href="/counter" style={{ color: '#eee', textDecoration: 'none' }}>
            Counter
          </a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
