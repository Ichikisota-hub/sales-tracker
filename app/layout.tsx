import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'origin-dx 数値管理',
  description: '月次営業活動記録・分析',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
