# 営業活動管理システム

スプレッドシートの構造を再現したWebアプリです。

## 技術スタック
- **フロントエンド**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **バックエンド/DB**: Supabase (PostgreSQL)
- **デプロイ**: Vercel
- **リポジトリ**: GitHub

---

## セットアップ手順

### 1. Supabase プロジェクト作成

1. https://supabase.com にアクセスし、新しいプロジェクトを作成
2. **SQL Editor** を開き、`supabase/migrations/001_initial_schema.sql` の内容を貼り付けて実行
3. プロジェクトの **Settings > API** から以下をコピー：
   - `Project URL`
   - `anon public` key

### 2. 環境変数の設定

`.env.local.example` を `.env.local` にコピーして編集：

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxxxxx...
```

### 3. ローカル起動

```bash
npm install
npm run dev
```

http://localhost:3000 でアクセス可能

### 4. GitHub へプッシュ

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/sales-tracker.git
git push -u origin main
```

### 5. Vercel デプロイ

1. https://vercel.com でアカウント作成
2. **New Project** → GitHub リポジトリを選択
3. **Environment Variables** に以下を追加：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy** をクリック

---

## 機能概要

### 日次入力シート
- 日付・曜日（土日は色分け）
- 月初入力：計画件数・計画稼働日数
- 各日の入力：
  - 計画稼働（セレクト）
  - 出勤状態（セレクト）
  - 稼働時間（セレクト）
  - 訪問・ネット対面・主権対面・商談・獲得（数値入力）
- 進捗：獲得累計 vs 計画進捗の差分（±表示）
- TTL行：月間合計

### 分析タブ
- 月間サマリー（生産性・各種率）
- **月間着地予想**（赤い大きなボックス）
- 行動量 合計/平均
- 1件取る為には（各指標の必要数）
- 曜日別集計（稼働日数・獲得数・生産性・着地予想・稼働割合）

### 設定タブ
- 担当者名20名分を編集・保存

### フィルター
- 画面上部で月・担当者を切り替え

---

## データ構造

```
sales_reps      - 担当者マスター（20名）
monthly_plans   - 月初計画（担当者×月）
daily_records   - 日次活動記録（担当者×日付）
```

---

## カスタマイズ

### 担当者名変更
アプリの「設定」タブから変更可能

### 月の追加
自動的に過去24ヶ月分が選択可能

### 出勤ステータスの追加
`components/SheetView.tsx` の `WORK_STATUSES` 配列を編集
