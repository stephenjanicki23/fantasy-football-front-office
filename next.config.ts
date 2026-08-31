import type { NextConfig } from 'next';

/**
 * Vercel builds its own serverless output and sets VERCEL=1 while doing so. Forcing
 * `output: 'standalone'` there fights that pipeline, so the standalone bundle is emitted
 * only off-Vercel — which is exactly where it is needed: the Dockerfile copies
 * .next/standalone, and Fly/Railway/Render/self-hosting run it directly.
 */
const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  // Keep server-only packages out of any client bundle.
  serverExternalPackages: ['@prisma/client', '@anthropic-ai/sdk'],

  ...(isVercel ? {} : { output: 'standalone' as const }),
};

export default nextConfig;
