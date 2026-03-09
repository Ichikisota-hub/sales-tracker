import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '営業活動管理システム',
  description: '月次営業活動記録・分析',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
