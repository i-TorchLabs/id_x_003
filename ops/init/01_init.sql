-- id_x_003 业务库 DDL（首启执行）
-- 通用触发器函数：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== 业务表 DDL 区（SME 校友咨询预约系统，对应 src/models/x_models.py） =====

-- 用户表
CREATE TABLE IF NOT EXISTS aa_enlist_user (
    id       SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL DEFAULT 'N/A',
    password VARCHAR(255) NOT NULL DEFAULT 'N/A',
    role     VARCHAR(255) NOT NULL DEFAULT 'user',
    "key"    TEXT         NOT NULL DEFAULT 'N/A',
    name     VARCHAR(255) NOT NULL DEFAULT 'N/A',
    grade    VARCHAR(255) NOT NULL DEFAULT 'N/A',
    number   VARCHAR(255) NOT NULL DEFAULT 'N/A',
    email    VARCHAR(255) NOT NULL DEFAULT 'N/A',
    time     TIMESTAMP    NULL DEFAULT NOW()
);
COMMENT ON TABLE aa_enlist_user IS '用户表';
COMMENT ON COLUMN aa_enlist_user.id IS 'ID';
COMMENT ON COLUMN aa_enlist_user.username IS '用户名';
COMMENT ON COLUMN aa_enlist_user.password IS '密码';
COMMENT ON COLUMN aa_enlist_user.role IS '角色';
COMMENT ON COLUMN aa_enlist_user."key" IS '密钥';
COMMENT ON COLUMN aa_enlist_user.name IS '姓名';
COMMENT ON COLUMN aa_enlist_user.grade IS '年级';
COMMENT ON COLUMN aa_enlist_user.number IS '学号';
COMMENT ON COLUMN aa_enlist_user.email IS '邮箱';
COMMENT ON COLUMN aa_enlist_user.time IS '时间';

-- 内容表
CREATE TABLE IF NOT EXISTS aa_enlist_content (
    id      SERIAL PRIMARY KEY,
    content TEXT      NOT NULL DEFAULT 'N/A',
    time    TIMESTAMP NULL DEFAULT NOW()
);
COMMENT ON TABLE aa_enlist_content IS '内容表';
COMMENT ON COLUMN aa_enlist_content.id IS 'ID';
COMMENT ON COLUMN aa_enlist_content.content IS '内容';
COMMENT ON COLUMN aa_enlist_content.time IS '时间';

-- 项目表
CREATE TABLE IF NOT EXISTS aa_enlist_project (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL DEFAULT 'N/A' UNIQUE,
    quota         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    content       TEXT         NOT NULL DEFAULT 'N/A',
    content_ex_id INTEGER      NULL REFERENCES aa_enlist_content (id),
    owner         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    "update"      TIMESTAMP    NULL DEFAULT NOW(),
    time          TIMESTAMP    NULL DEFAULT NOW()
);
COMMENT ON TABLE aa_enlist_project IS '项目表';
COMMENT ON COLUMN aa_enlist_project.id IS 'ID';
COMMENT ON COLUMN aa_enlist_project.name IS '名称';
COMMENT ON COLUMN aa_enlist_project.quota IS '名额';
COMMENT ON COLUMN aa_enlist_project.content IS '内容';
COMMENT ON COLUMN aa_enlist_project.content_ex_id IS '内容扩展ID';
COMMENT ON COLUMN aa_enlist_project.owner IS '拥有者';
COMMENT ON COLUMN aa_enlist_project."update" IS '更新';
COMMENT ON COLUMN aa_enlist_project.time IS '时间';

-- 活动表
CREATE TABLE IF NOT EXISTS aa_enlist_activity (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(255) NOT NULL DEFAULT 'N/A',
    project_id          INTEGER      NULL REFERENCES aa_enlist_project (id),
    activity_start_time TIMESTAMP    NULL,
    activity_end_time   TIMESTAMP    NULL,
    apply_start_time    TIMESTAMP    NULL,
    apply_end_time      TIMESTAMP    NULL,
    time                TIMESTAMP    NULL DEFAULT NOW(),
    "update"            TIMESTAMP    NULL DEFAULT NOW()
);
COMMENT ON TABLE aa_enlist_activity IS '活动表';
COMMENT ON COLUMN aa_enlist_activity.id IS 'ID';
COMMENT ON COLUMN aa_enlist_activity.name IS '名称';
COMMENT ON COLUMN aa_enlist_activity.project_id IS '项目ID';
COMMENT ON COLUMN aa_enlist_activity.activity_start_time IS '活动开始时间';
COMMENT ON COLUMN aa_enlist_activity.activity_end_time IS '活动结束时间';
COMMENT ON COLUMN aa_enlist_activity.apply_start_time IS '报名开始时间';
COMMENT ON COLUMN aa_enlist_activity.apply_end_time IS '报名结束时间';
COMMENT ON COLUMN aa_enlist_activity.time IS '时间';
COMMENT ON COLUMN aa_enlist_activity."update" IS '更新';

-- 报名表
CREATE TABLE IF NOT EXISTS aa_enlist_apply (
    id             SERIAL PRIMARY KEY,
    project_id     INTEGER      NULL REFERENCES aa_enlist_project (id),
    activity_id    INTEGER      NULL REFERENCES aa_enlist_activity (id),
    user_id        VARCHAR(255) NOT NULL DEFAULT 'N/A',
    "order"        VARCHAR(255) NOT NULL DEFAULT 'N/A',
    name           VARCHAR(255) NOT NULL DEFAULT 'N/A',
    number         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    grade          VARCHAR(255) NOT NULL DEFAULT 'N/A',
    email          VARCHAR(255) NOT NULL DEFAULT 'N/A',
    time           TIMESTAMP    NULL DEFAULT NOW(),
    state          VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_1         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_2         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_3         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_4         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_5         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_6         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_7         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    info_8         VARCHAR(255) NOT NULL DEFAULT 'N/A',
    send_question  VARCHAR(255) NOT NULL DEFAULT 'False'
);
COMMENT ON TABLE aa_enlist_apply IS '报名表';
COMMENT ON COLUMN aa_enlist_apply.id IS 'ID';
COMMENT ON COLUMN aa_enlist_apply.project_id IS '项目ID';
COMMENT ON COLUMN aa_enlist_apply.activity_id IS '活动ID';
COMMENT ON COLUMN aa_enlist_apply.user_id IS '用户ID';
COMMENT ON COLUMN aa_enlist_apply."order" IS '订单号';
COMMENT ON COLUMN aa_enlist_apply.name IS '姓名';
COMMENT ON COLUMN aa_enlist_apply.number IS '学号';
COMMENT ON COLUMN aa_enlist_apply.grade IS '年级';
COMMENT ON COLUMN aa_enlist_apply.email IS '邮箱';
COMMENT ON COLUMN aa_enlist_apply.time IS '时间';
COMMENT ON COLUMN aa_enlist_apply.state IS '状态';
COMMENT ON COLUMN aa_enlist_apply.info_1 IS '信息1';
COMMENT ON COLUMN aa_enlist_apply.info_2 IS '信息2';
COMMENT ON COLUMN aa_enlist_apply.info_3 IS '信息3';
COMMENT ON COLUMN aa_enlist_apply.info_4 IS '信息4';
COMMENT ON COLUMN aa_enlist_apply.info_5 IS '信息5';
COMMENT ON COLUMN aa_enlist_apply.info_6 IS '信息6';
COMMENT ON COLUMN aa_enlist_apply.info_7 IS '信息7';
COMMENT ON COLUMN aa_enlist_apply.info_8 IS '信息8';
COMMENT ON COLUMN aa_enlist_apply.send_question IS '发送问卷调查';

-- HTML模板
CREATE TABLE IF NOT EXISTS aa_html_template (
    id   SERIAL PRIMARY KEY,
    type VARCHAR(255) NOT NULL DEFAULT 'N/A',
    name VARCHAR(255) NOT NULL DEFAULT 'N/A',
    html TEXT         NOT NULL DEFAULT 'N/A'
);
COMMENT ON TABLE aa_html_template IS 'HTML模板';
COMMENT ON COLUMN aa_html_template.id IS 'ID';
COMMENT ON COLUMN aa_html_template.type IS '类型';
COMMENT ON COLUMN aa_html_template.name IS '名称';
COMMENT ON COLUMN aa_html_template.html IS 'HTML';

-- 拥有者
CREATE TABLE IF NOT EXISTS aa_owner_info (
    id    SERIAL PRIMARY KEY,
    name  VARCHAR(255) NOT NULL DEFAULT 'N/A',
    email VARCHAR(255) NOT NULL DEFAULT 'N/A'
);
COMMENT ON TABLE aa_owner_info IS '拥有者';
COMMENT ON COLUMN aa_owner_info.id IS 'ID';
COMMENT ON COLUMN aa_owner_info.name IS '名称';
COMMENT ON COLUMN aa_owner_info.email IS '邮箱';
