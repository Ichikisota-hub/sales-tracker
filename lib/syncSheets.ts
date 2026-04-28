// データ保存後に呼ぶだけでGoogleスプレッドシートへ自動同期
// fire-and-forget: await不要、エラーはサイレントに無視
export function syncSheets() {
  if (typeof window === 'undefined') return
  fetch('/api/sheets/sync', { method: 'POST' }).catch(() => {})
}
