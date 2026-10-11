/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === "production";
const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const apiUpstream = process.env.API_UPSTREAM_URL || "";
const apiOrigin = (() => {
  try {
    return new URL(apiBase).origin;
  } catch {
    return "'self'";
  }
})();

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  `connect-src 'self' ${apiOrigin === "'self'" ? "" : apiOrigin}`.trim(),
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async rewrites() {
    if (!apiUpstream) return [];
    return [{ source: "/api/:path*", destination: `${apiUpstream.replace(/\/$/, "")}/:path*` }];
  },
};

module.exports = nextConfig;
