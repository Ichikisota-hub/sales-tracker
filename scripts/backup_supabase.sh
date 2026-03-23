#!/bin/bash
# Supabase テーブルバックアップスクリプト
# 毎日1回 ~/Desktop/sales-tracker-backups/ にJSONで保存

SUPABASE_URL="https://gambtsaekmszfgylausi.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhbWJ0c2Fla21zemZneWxhdXNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODkxOTMsImV4cCI6MjA4ODM2NTE5M30.jVsXbBtqWleSdqECuuy1so523u9Qti39lkAPzXcApJk"

TABLES=(
  "sales_reps"
  "teams"
  "contracts"
  "daily_records"
  "daily_reports"
  "monthly_plans"
  "work_schedules"
  "organizations"
  "organization_members"
  "invitations"
)

DATE=$(date +"%Y-%m-%d")
BACKUP_DIR="$HOME/Desktop/sales-tracker-backups/$DATE"
mkdir -p "$BACKUP_DIR"

LOG="$BACKUP_DIR/backup.log"
echo "=== バックアップ開始: $(date) ===" > "$LOG"

for TABLE in "${TABLES[@]}"; do
  OUT="$BACKUP_DIR/${TABLE}.json"
  HTTP_CODE=$(curl -s -o "$OUT" -w "%{http_code}" \
    "${SUPABASE_URL}/rest/v1/${TABLE}?select=*&limit=100000" \
    -H "apikey: ${ANON_KEY}" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Accept: application/json")

  if [ "$HTTP_CODE" = "200" ]; then
    COUNT=$(python3 -c "import json,sys; d=json.load(open('$OUT')); print(len(d))" 2>/dev/null || echo "?")
    echo "  ✓ ${TABLE}: ${COUNT}件" >> "$LOG"
  else
    echo "  ✗ ${TABLE}: HTTP ${HTTP_CODE}" >> "$LOG"
  fi
done

echo "=== バックアップ完了: $(date) ===" >> "$LOG"
cat "$LOG"
