const postsData: Record<string, { title: string; content: string; date: string }> = {
  'getting-started': {
    title: 'Next.js 마이크로프론트엔드 시작하기',
    content: `Next.js의 multi-zone 기능을 활용하면 여러 독립적인 Next.js 앱을 하나의 도메인에서 서비스할 수 있습니다.

## 핵심 개념

1. **Gateway (default) 앱**: 모든 요청을 받아 라우팅 규칙에 따라 분배
2. **Child 앱**: 특정 경로를 담당하는 독립적인 Next.js 앱
3. **Zone-aware 네비게이션**: 같은 앱 내 이동은 SPA, 다른 앱으로의 이동은 full-page nav

## 장점

- 각 팀이 독립적으로 개발/배포 가능
- 기술 스택 버전을 팀별로 다르게 관리 가능
- 장애 격리 — 한 앱의 문제가 다른 앱에 영향 없음`,
    date: '2026-03-11'
  },
  'zone-routing': {
    title: 'Zone 기반 라우팅 이해하기',
    content: `Gateway 앱의 middleware가 요청 pathname을 분석하여 적절한 child 앱으로 rewrite합니다.

## 라우팅 흐름

1. 브라우저에서 \`/blog/hello\` 요청
2. Gateway(home) 앱의 middleware가 요청을 수신
3. mfe.config.json의 routing 규칙과 매칭
4. \`/blog/:path*\` 패턴에 매칭 → blog 앱으로 rewrite
5. blog 앱이 해당 페이지를 렌더링하여 응답`,
    date: '2026-03-10'
  },
  'independent-deploy': {
    title: '독립 배포 전략',
    content: `각 마이크로프론트엔드는 독립적인 빌드 파이프라인을 가질 수 있습니다.

## 배포 방식

- **Docker**: 각 앱을 별도 컨테이너로 배포
- **Kubernetes**: 앱별 Pod + Service 구성
- **AWS ECS**: Task Definition 별로 앱 배포

## 환경 변수로 URL 관리

\`MFE_BLOG_URL\`, \`MFE_COUNTER_URL\` 등 환경 변수로 각 앱의 URL을 런타임에 지정할 수 있습니다.`,
    date: '2026-03-09'
  }
};

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = postsData[slug];

  if (!post) {
    return (
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <h1>404 - 포스트를 찾을 수 없습니다</h1>
        <a href="/blog" style={{ color: '#0070f3' }}>
          &larr; 블로그 목록으로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <a href="/blog" style={{ color: '#0070f3', textDecoration: 'none' }}>
        &larr; 블로그 목록
      </a>

      <article style={{ marginTop: '1.5rem' }}>
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

        <time style={{ display: 'block', fontSize: '0.85rem', color: '#999', marginBottom: '0.5rem' }}>
          {post.date}
        </time>
        <h1 style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>{post.title}</h1>

        <div style={{ lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {post.content}
        </div>
      </article>
    </div>
  );
}
