import type { NextConfig } from "next";

/**
 * 安全响应头在应用层设置，而不是只靠反向代理。
 *
 * deploy/Caddyfile 已经为自建服务器加了 HSTS / nosniff / X-Frame-Options /
 * Referrer-Policy，但家属门户经由 Vercel 分发，那条链路不过 Caddy，等于没有
 * 任何安全头。放在 Next 这一层，两条部署路径都能覆盖。
 *
 * CSP 说明：next/font 会注入内联样式，Next 运行时会注入内联脚本，因此
 * style-src / script-src 保留 'unsafe-inline'。connect-src 只允许 self 与
 * 已配置的 Supabase 源；服务端邮件和 AI 调用不需要浏览器直连。frame-ancestors 'none'
 * 与 X-Frame-Options 双写，兼容旧浏览器。
 */
function configuredOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const supabaseOrigin = configuredOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const connectSources = ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  `connect-src ${connectSources}`,
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_MODE: process.env.APP_MODE ?? (process.env.NODE_ENV === "production" ? "invalid" : "demo"),
    NEXT_PUBLIC_AUTH_MODE: process.env.AUTH_MODE ?? (process.env.NODE_ENV === "production" ? "invalid" : "demo"),
    NEXT_PUBLIC_REGISTRATION_ENABLED: process.env.NEXT_PUBLIC_REGISTRATION_ENABLED ?? "false",
  },
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // 患者数据与认证接口一律不进入任何缓存层。
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
