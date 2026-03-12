import { withMicrofrontends } from 'nextjs-microfrontends/next/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default withMicrofrontends(nextConfig, {
  configPath: '../../mfe.config.json',
  appName: 'blog'
});
