// データ保存後に呼ぶだけでGoogleスプレッドシートへ自動同期
// 5秒間のdebounce: 連続保存時は最後の操作から5秒後に1回だけ実行
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function syncSheets() {
  if (typeof window === 'undefined') return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    fetch('/api/sheets/sync', { method: 'POST' }).catch(() => {})
    debounceTimer = null
  }, 5000)
}
