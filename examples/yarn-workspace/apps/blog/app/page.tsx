const posts = [
  {
    slug: 'getting-started',
    title: 'Next.js 마이크로프론트엔드 시작하기',
    excerpt: 'Next.js multi-zone 아키텍처로 독립적인 프론트엔드 앱을 구성하는 방법을 알아봅니다.',
    date: '2026-03-11'
  },
  {
    slug: 'zone-routing',
    title: 'Zone 기반 라우팅 이해하기',
    excerpt: 'Gateway 앱이 요청을 child 앱으로 rewrite하는 메커니즘을 상세히 설명합니다.',
    date: '2026-03-10'
  },
  {
    slug: 'independent-deploy',
    title: '독립 배포 전략',
    excerpt: '각 마이크로프론트엔드를 독립적으로 빌드하고 배포하는 방법을 다룹니다.',
    date: '2026-03-09'
  }
];

export default function BlogPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <div
        style={{
          display: 'inline-block',
          padding: '0.25rem 0.75rem',
          background: '#0f3460',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '0.8rem',
          marginBottom: '1rem'
        }}
      >
        blog 앱 (port 3001)
      </div>

      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Blog</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        이 페이지는 <strong>blog</strong> 앱에서 렌더링됩니다.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {posts.map((post) => (
          <li key={post.slug}>
            <a
              href={`/blog/${post.slug}`}
              style={{
                display: 'block',
                padding: '1.5rem',
                border: '1px solid #ddd',
                borderRadius: '8px',
                textDecoration: 'none',
                color: 'inherit'
              }}
            >
              <time style={{ fontSize: '0.85rem', color: '#999' }}>{post.date}</time>
              <h2 style={{ margin: '0.5rem 0', fontSize: '1.3rem' }}>{post.title}</h2>
              <p style={{ color: '#666', margin: 0 }}>{post.excerpt}</p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
