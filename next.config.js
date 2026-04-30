/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // lucide-react のツリーシェイキングを最適化（使っているアイコンのみバンドル）
    optimizePackageImports: ['lucide-react'],
  },
}
module.exports = nextConfig
