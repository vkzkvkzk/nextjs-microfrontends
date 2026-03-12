import {
  createMicrofrontendsMiddleware,
  getMicrofrontendsMatcher
} from 'nextjs-microfrontends/next/middleware';

const handler = createMicrofrontendsMiddleware();

export function middleware(request: import('next/server').NextRequest) {
  return handler(request);
}

export const config = {
  matcher: getMicrofrontendsMatcher()
};
