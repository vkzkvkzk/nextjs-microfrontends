export default function HomePage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
        Next.js Microfrontends
      </h1>
      <p style={{ fontSize: '1.2rem', color: '#666', marginBottom: '2rem' }}>
        이 페이지는 <strong>home</strong> 앱(게이트웨이)에서 렌더링됩니다.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem'
        }}>
        <a
          href="/blog"
          style={{
            display: 'block',
            padding: '2rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'border-color 0.2s'
          }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Blog &rarr;</h2>
          <p style={{ color: '#666' }}>
            블로그 앱으로 이동합니다. /blog 경로는 별도의 Next.js 앱이
            처리합니다.
          </p>
        </a>

        <a
          href="/counter"
          style={{
            display: 'block',
            padding: '2rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'border-color 0.2s'
          }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Counter &rarr;</h2>
          <p style={{ color: '#666' }}>
            카운터 앱으로 이동합니다. /counter 경로는 별도의 Next.js 앱이
            처리합니다.
          </p>
        </a>
      </div>

      <section
        style={{
          marginTop: '3rem',
          padding: '1.5rem',
          background: '#f5f5f5',
          borderRadius: '8px'
        }}>
        <h2 style={{ marginBottom: '1rem' }}>아키텍처</h2>
        <pre style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
          {`Browser → home (port 3000, gateway)
  ├─ /          → home 자체 렌더링
  ├─ /blog/*    → blog 앱 (port 3001)으로 rewrite
  └─ /counter/* → counter 앱 (port 3002)으로 rewrite`}
        </pre>
      </section>
    </div>
  );
}
