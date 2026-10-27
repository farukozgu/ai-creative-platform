import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  distDir: process.env.KLAY_VIDEO_QA === "true" ? ".next-video-qa" : ".next",
  serverExternalPackages: ["sharp", "ffmpeg-static"],
  outputFileTracingIncludes: { "/api/dashboard/videos/*/fidelity-analysis": ["./node_modules/ffmpeg-static/ffmpeg*"] },
  experimental: {globalNotFound: true},
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
