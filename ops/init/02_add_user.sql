-- id_x_003 预置数据：初始管理员用户（首启执行，跟随 01_init.sql）

INSERT INTO aa_enlist_user (
    id,
    username,
    password,
    role,
    "key",
    name,
    grade,
    number,
    email,
    time
) VALUES (
    1,
    'master',
    'WWxkR2VtUkhWbms9',
    'admin',
    'N/A',
    'Ray',
    'N/A',
    '003617',
    'rayzha@cuhk.edu.cn',
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 将序列推进到 1，避免后续自增 id 与预置数据冲突
SELECT setval(pg_get_serial_sequence('aa_enlist_user', 'id'), GREATEST(1, (SELECT MAX(id) FROM aa_enlist_user)));
