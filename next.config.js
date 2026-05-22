/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // PDF・CSVアップロード用にリクエストボディ上限を20MBに拡張
  serverExternalPackages: ['pdf-parse'],
}
module.exports = nextConfig
