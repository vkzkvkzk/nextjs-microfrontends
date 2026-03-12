# Next.js Microfrontends Example: pnpm Workspace

pnpm workspace로 구성된 마이크로프론트엔드 예제입니다.

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
pnpm install
```

### 2. 개발 서버

```bash
# 모든 앱 동시 실행
pnpm dev
```

`pnpm --parallel -r run dev`로 3개 앱을 병렬 실행합니다.

### 3. 빌드

```bash
pnpm build
```

### 4. 브라우저 확인

- `http://localhost:3000` → Home 메인 페이지
- `http://localhost:3000/blog` → Blog 앱 (home이 프록시)
- `http://localhost:3000/counter` → Counter 앱 (home이 프록시)

## 구조

```
examples/pnpm-workspace/
├── package.json             # pnpm workspace 루트
├── pnpm-workspace.yaml      # workspace 정의
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
│   │       ├── page.tsx
│   │       └── [slug]/
│   │           └── page.tsx
│   └── counter/             # @example/counter — 카운터 앱 (basePath: /counter)
│       ├── next.config.ts
│       └── app/
│           ├── layout.tsx
│           └── page.tsx
```

## pnpm vs Turborepo

| 기능        | pnpm workspace          | Turborepo + npm           |
| ----------- | ----------------------- | ------------------------- |
| 의존성 관리 | pnpm (심볼릭 링크 기반) | npm workspaces (호이스팅) |
| 병렬 실행   | `pnpm --parallel -r`    | `turbo dev`               |
| 빌드 캐싱   | ❌ 없음                 | ✅ 원격/로컬 캐시         |
| 설정 파일   | `pnpm-workspace.yaml`   | `turbo.json`              |

## 핵심 개념

- **home**: `default: true`로 설정된 게이트웨이. 모든 요청을 받아 라우팅 규칙에 따라 child 앱으로 rewrite
- **blog/counter**: `routing`에 정의된 경로를 처리하는 child 앱. `basePath`가 자동 설정됨
- **MicrofrontendsLink**: zone 간 이동 시 SPA nav / full-page nav를 자동 판별
