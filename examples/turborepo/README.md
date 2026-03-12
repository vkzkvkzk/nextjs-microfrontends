# Next.js Microfrontends Example: Home + Blog + Counter

Turborepo + npm workspaces로 구성된 마이크로프론트엔드 예제입니다.

| App         | Port | 역할                      |
| ----------- | ---- | ------------------------- |
| **home**    | 3000 | 메인 게이트웨이 (default) |
| **blog**    | 3001 | 블로그 (`/blog/*`)        |
| **counter** | 3002 | 카운터 (`/counter/*`)     |

## 아키텍처

```
Browser → home (port 3000, gateway)
           ├─ /          → home 자체 렌더링
           ├─ /blog/*    → blog 앱으로 rewrite
           └─ /counter/* → counter 앱으로 rewrite
```

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버

```bash
# 모든 앱 동시 실행 (Turborepo)
npm run dev
```

Turborepo가 3개 앱의 `dev` 스크립트를 병렬로 실행합니다.

### 3. 빌드

```bash
npm run build
```

### 4. 브라우저 확인

- `http://localhost:3000` → Home 메인 페이지
- `http://localhost:3000/blog` → Blog 앱 (home이 프록시)
- `http://localhost:3000/counter` → Counter 앱 (home이 프록시)

## 구조

```
examples/home-blog-counter/
├── package.json             # npm workspaces 루트
├── turbo.json               # Turborepo 설정
├── mfe.config.json          # 마이크로프론트엔드 설정
├── apps/
│   ├── home/                # @example/home — 메인 게이트웨이 앱
│   │   ├── next.config.ts
│   │   ├── middleware.ts
│   │   └── app/
│   │       ├── layout.tsx
│   │       └── page.tsx
│   ├── blog/                # @example/blog — 블로그 앱 (basePath: /blog)
│   │   ├── next.config.ts
│   │   └── app/
│   │       ├── layout.tsx
│   │       ├── page.tsx     # /blog
│   │       └── [slug]/
│   │           └── page.tsx # /blog/:slug
│   └── counter/             # @example/counter — 카운터 앱 (basePath: /counter)
│       ├── next.config.ts
│       └── app/
│           ├── layout.tsx
│           └── page.tsx     # /counter
```

## 핵심 개념

- **home**: `default: true`로 설정된 게이트웨이. 모든 요청을 받아 라우팅 규칙에 따라 child 앱으로 rewrite
- **blog/counter**: `routing`에 정의된 경로를 처리하는 child 앱. `basePath`가 자동 설정됨
- **MicrofrontendsLink**: zone 간 이동 시 SPA nav / full-page nav를 자동 판별
