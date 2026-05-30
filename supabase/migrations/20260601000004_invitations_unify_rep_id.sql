-- invitations のカラム重複を解消し rep_id に一本化する
--
-- 背景: テーブル作成時に sales_rep_id、別マイグレーション(020)で rep_id を追加して
--   カラムが二重定義されていた。アプリは全て rep_id を参照しており sales_rep_id は死蔵。
--   死蔵カラムを残すと「どちらに書いたか」で事故るため rep_id に統一する。

-- sales_rep_id に残っている値を rep_id に移行（rep_id 未設定のもののみ）
UPDATE invitations
  SET rep_id = sales_rep_id
  WHERE rep_id IS NULL AND sales_rep_id IS NOT NULL;

-- 死蔵カラムを削除（FK・インデックスも併せて落ちる）
ALTER TABLE invitations DROP COLUMN IF EXISTS sales_rep_id;
