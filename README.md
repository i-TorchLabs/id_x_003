# id_x_003

结构体_003: SME 校友咨询（Alumni Advising）预约系统

由 `sme_cdc_enlist_aa`（Quart + 同步 SQLAlchemy + REST）重构而来，业务逻辑保持不变，详见 `docs/project.md`。

## 技术栈

- Python 3.10
- Litestar（Web 框架，经 `src/adapt.py` 挂载至 `/b/id_x_003/graphql`）
- Strawberry GraphQL（唯一入口 `/graphql`，Query/Mutation）
- SQLAlchemy 2.0（异步 ORM）

## 目录结构

```text
x_plugin.py                 # 插件入口（PluginInterface：建表/会话注入）
src/
  models/x_models.py        # ORM 模型（aa_enlist_* 7 张表）+ Base + 会话工厂
  schemas/x_schemas.py      # Strawberry Input/Type 契约（无业务逻辑）
  views/x_views.py          # 全部业务逻辑（view_* 命名）
  controllers/x_controllers.py  # GraphQL Query/Mutation，thin resolvers
docs/project.md             # 产品功能文档
web/                        # 前端（Next.js）
ops/                        # 部署配置
```

## 接口说明

- 响应统一为 `{code, msg, data}`，与原 REST 响应结构一致；`data` 为 JSON 载荷。
- 管理接口需在请求头携带 `Token`（登录后下发的 `key`）。
- 文件类接口（排期模板下载、报名数据导出）以 `file_name + file_base64` 返回；
  批量排期上传以 `file_name + file_base64` 传入 `.xlsx`。
- 邮件（报名/取消/提醒）逻辑与原系统一致，由 `careersme@cuhk.edu.cn` 发出。
