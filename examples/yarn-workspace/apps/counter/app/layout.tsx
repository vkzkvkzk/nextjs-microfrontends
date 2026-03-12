import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Counter - Microfrontends Example'
};

export default function CounterLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <nav
          style={{
            display: 'flex',
            gap: '1rem',
            padding: '1rem 2rem',
            background: '#533483',
            borderBottom: '2px solid #16213e'
          }}>
          <a href="/" style={{ color: '#eee', textDecoration: 'none' }}>
            Home
          </a>
          <a href="/blog" style={{ color: '#eee', textDecoration: 'none' }}>
            Blog
          </a>
          <a
            href="/counter"
            style={{
              color: '#e94560',
              fontWeight: 'bold',
              textDecoration: 'none'
            }}>
            Counter
          </a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
