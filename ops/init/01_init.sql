-- id_x_003 业务库 DDL（首启执行）
-- 通用触发器函数：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== 业务表 DDL 区 =====
-- 示例：
-- CREATE TABLE IF NOT EXISTS "user" (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(64) NOT NULL,
--     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- COMMENT ON TABLE "user" IS '用户表';
-- CREATE TRIGGER trg_user_updated_at BEFORE UPDATE ON "user"
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
