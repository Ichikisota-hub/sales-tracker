-- 旧Lメンバーランクを追加（条件分岐は計算ロジック側で処理）
INSERT INTO incentive_rates (rank, rate_per_contract, apo_rate)
VALUES ('旧Lメンバー', 40000, 20000)
ON CONFLICT (rank) DO NOTHING;
