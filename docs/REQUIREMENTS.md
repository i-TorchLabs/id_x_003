# SME 校友咨询预约系统 — 需求规格说明书

> **文档状态**：v2.2
>
> **甲方**：CDC 业务方（香港中文大学（深圳）经管学院职业发展中心）
> **乙方**：开发供应商
> **目的**：明确系统技术栈、功能范围、业务规则与验收标准，作为乙方开发交付与甲方验收的统一基准
>
> **配套文档**：`docs/project.md`（业务背景与甲方沟通摘要）

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈要求](#2-技术栈要求)
3. [架构要求](#3-架构要求)
4. [功能需求详述](#4-功能需求详述)
5. [UI/UX 范式要求](#5-uiux-范式要求)
6. [数据模型](#6-数据模型)
7. [API 接口规范](#7-api-接口规范)
8. [安全要求](#8-安全要求)
9. [业务规则](#9-业务规则)
10. [部署与运维要求](#10-部署与运维要求)
11. [非功能性需求](#11-非功能性需求)
12. [验收标准](#12-验收标准)
13. [附录：交付物清单](#13-附录交付物清单)

---

## 1. 项目概述

### 1.1 项目背景

经管学院（SME）需要一套校友咨询预约系统，支持学生在线浏览可预约的校友咨询活动、提交报名、取消报名；管理员通过后台管理咨询项目与活动排期，并支持数据导出与定时邮件通知。

### 1.2 项目定位

- **核心角色**：学生（SSO 登录） + 管理员（账号密码登录）
- **核心流程**：学生浏览活动 → 报名 → 参加 → 收到问卷；管理员创建项目 → 排期 → 导出数据
- **非目标**：不做即时通讯、不做支付、不做微信集成

### 1.3 项目原则

| 原则 | 说明 |
|------|------|
| **安全优先** | 传输加密（RSA-OAEP）、密码哈希（PBKDF2-SHA256）、防暴力破解、防 XSS/CSRF、GraphQL introspection 禁用 |
| **插件化** | 沿用 i-Core 插件协议，Controller → View → Model → Schema 四层分层 |
| **无状态** | 后端通过 Token 请求头识别会话；前端通过 localStorage 维护登录态 |
| **邮件解耦** | 邮件发送失败不阻断业务操作，仅记录日志 |

---

## 2. 技术栈要求

### 2.1 后端

| 组件 | 选型 | 说明 |
|------|------|------|
| 框架 | **Litestar** | ASGI 异步 Web 框架 |
| GraphQL | **Strawberry** | 类型化 GraphQL 引擎（与 Litestar 深度集成） |
| ORM | **SQLAlchemy 2.0 (async)** | AsyncSession + DeclarativeBase |
| 数据库 | **PostgreSQL 18** | 生产级关系型数据库 |
| 加密 | **cryptography (RSA-2048)** | 登录传输加密 |
| 密码 | **hashlib PBKDF2-HMAC-SHA256** | 100,000 次迭代 |
| Excel | **openpyxl + pandas** | 导出/上传 xlsx |
| OAuth | **ADFS OIDC** | 学生 SSO（授权码授予流） |
| 邮件 | **smtplib (STARTTLS)** | SMTP 邮件通知 |

### 2.2 前端

| 组件 | 选型 | 说明 |
|------|------|------|
| 框架 | **Next.js 15** (App Router) | React SSR 框架 |
| 语言 | **TypeScript** | 严格模式 |
| UI 库 | **HeroUI** (heroui/react) | 统一组件体系（Table/Pagination/Radio/Button/Input 等） |
| 日历 | **FullCalendar** | 活动日历视图（周/月/日切换） |
| 富文本 | **Quill 2.x** | 管理员项目内容编辑 |
| XSS 防护 | **DOMPurify** | 前端富文本消毒 |
| HTTP | **fetch** | GraphQL 请求（无 Axios 依赖） |
| 加密 | **Web Crypto API** | 前端 RSA-OAEP(SHA-256) 加密 |
| 时间 | **dayjs** | 轻量时间处理 |

### 2.3 基础设施

| 组件 | 选型 | 说明 |
|------|------|------|
| 容器 | **Podman / Docker** | Rootless 容器编排 |
| 编排 | **podman-compose** | 4-container Pod：db + service + web + haproxy |
| 代理 | **HAProxy 3.2** | 统一入口（端口 8003），HTTP 转发 |
| Cron | **OS crond** | 定时邮件脚本调度 |

---

## 3. 架构要求

### 3.1 后端四层分层（MUST）

```
Controllers (x_controllers.py)  ← thin resolvers，只做参数透传，委托 Views
    ↓
Views (x_views.py)              ← 全部业务逻辑
    ↓
Models (x_models.py)            ← ORM 模型 + async_sessionmaker
    ↓
Schemas (x_schemas.py)          ← Strawberry GraphQL Input/Type 纯类型
```

### 3.2 插件化规范（MUST）

- 主入口：`x_plugin.py`（实现 zyx 插件协议）
- 路由注册：`register_routers(route_prefix)` 返回 Litestar Router
- Session 注入：`register_engine(engine)` → `set_session_maker(async_sessionmaker(engine))`
- 禁止在 `Controllers` / `Schemas` 写入任何业务逻辑

### 3.3 GraphQL 规范（MUST）

- **端点**：`POST /graphql`（禁止 GET 查询，禁止 GraphiQL IDE）
- **安全扩展**：`DisableIntrospection()` + `QueryDepthLimiter(max_depth=8)`
- **认证**：请求头 `Token`（由 `_get_token(info)` 从 Strawberry Info.context 提取）
- **响应结构**：
  - 业务操作：`ApiResponse { code: Int, msg: String, data: JSON }`
  - 文件操作：`FileResponse { code: Int, msg: String, fileName: String, fileBase64: String }`
- **命名**：Strawberry 默认 camelCase（前端传 camelCase，后端 Python 字段为 snake_case）
- **分页**：offset（页码，1-based）+ limit（每页数量，最大值 100）

---

## 4. 功能需求详述

> 以下为各功能模块的业务需求描述，含校验规则与行为预期。
> 具体技术实现（组件选型、状态管理策略、代码组织、接口设计等）由乙方开发团队根据架构要求自行决策。

---

### 模块 A：登录与认证

#### A1. 管理员登录

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| A1.1 | 提供用户名 + 密码登录表单，支持前端 RSA-2048 OAEP 传输加密（先获取服务端公钥，再加密提交） | MUST |
| A1.2 | 连续登录失败 ≥ 3 次后，后续登录尝试要求输入图形验证码 | MUST |
| A1.3 | 连续登录失败 ≥ 5 次后，锁定账号 10 分钟，期间禁止登录（含正确凭据） | MUST |
| A1.4 | 验证码由后端生成（图形格式），一次性使用，有效期 5 分钟 | MUST |
| A1.5 | 登录成功后返回 Token（有效期 72 小时）、用户 ID 和角色，前端持久化存储 | MUST |
| A1.6 | 按角色跳转：admin → 管理后台首页，user → 学生端首页 | MUST |
| A1.7 | 密码以 PBKDF2-SHA256 或 bcrypt/argon2id 存储（禁止明文或弱哈希） | MUST |
| A1.8 | 登录失败返回统一错误提示，不区分"用户名不存在"与"密码错误" | SHOULD |

**错误行为**

- 凭据错误或用户不存在 → 401
- 需验证码但未提供或错误 → 428（同时返回新验证码）
- 账号锁定中 → 423（含剩余锁定时间）
- RSA 密文解密失败 → 400（提示刷新页面重新获取公钥）

---

#### A2. 学生 SSO 登录

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| A2.1 | 对接 CUHK ADFS，采用 OAuth2 Authorization Code Flow 完成认证 | MUST |
| A2.2 | 前端生成 CSRF state 随机串，携带至 ADFS 授权请求，回调时校验一致性 | MUST |
| A2.3 | ADFS 回调后，前端将授权码提交后端，后端以 client_secret 换取 id_token | MUST |
| A2.4 | 后端验证 id_token 签名、有效期（exp）、受众（aud）、签发者（iss），提取用户身份标识（UPN/email） | MUST |
| A2.5 | 首次登录自动建档（用户表插入记录），无需手动注册 | MUST |
| A2.6 | SSO 回调失败返回明确错误提示，支持用户重试 | MUST |
| A2.7 | client_secret 仅存后端环境变量，严禁进入前端代码或客户端可访问的环境变量 | MUST |
| A2.8 | 支持 nonce 参数防重放（可选，视 ADFS 版本兼容性而定） | SHOULD |

**错误行为**

- 授权码无效/过期/被重放 → 401
- id_token 验签或声明解析失败 → 401
- SSO 环境变量未配置 → 500

---

#### A3. 登出

| 编号 | 需求 | 优先级 |
|------|------|--------|
| A3.1 | 管理员登出：清空客户端存储的登录态 → 跳转登录页 | MUST |
| A3.2 | 学生登出：清空客户端存储的登录态 → 跳转 ADFS 登出 URL | MUST |
| A3.3 | 后端登出接口将 Token 标记为失效（不依赖客户端自行清理） | MUST |
| A3.4 | 登出操作需二次确认弹窗 | MUST |

---

### 模块 B：学生端 · 活动浏览

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| B1 | 活动首页展示品牌区域（"SME IAO ALUMNI ADVISING"），含"My Records"入口 | MUST |
| B2 | 支持列表视图与日历视图，用户可一键切换，默认列表视图 | MUST |
| B3 | **列表视图**：分页表格展示，列含 Date / Time / Title / State / Occupied / Options | MUST |
| B4 | **日历视图**：按活动日期展示，支持周/月/日三种粒度切换 | MUST |
| B5 | 活动按状态着色区分：Open（绿色）、Full（红色）、Closed（灰色） | MUST |
| B6 | 提供时间区间筛选（起止日期可选）和活动名模糊搜索 | MUST |
| B7 | 仅展示未来活动（开始时间 ≥ 当日）；已结束活动不可见 | MUST |
| B8 | 点击活动条目或日历事件 → 跳转报名详情页 | MUST |
| B9 | 搜索框输入时提供活动名实时补全建议（模糊匹配） | MUST |

**活动状态判定规则**

| 条件 | 状态 |
|------|------|
| 距活动开始 < 24 小时（不论名额） | Closed |
| 已报名人数 < 名额 | Open |
| 已报名人数 ≥ 名额 | Full |

---

### 模块 C：学生端 · 活动报名

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| C1 | 活动详情页展示：活动名称、富文本项目介绍（经 XSS 消毒后渲染）、日期、状态 | MUST |
| C2 | 咨询话题列表：已占用话题置灰不可选，未占用可点选 | MUST |
| C3 | 提交报名：用户选择话题后调用报名接口 | MUST |
| C4 | **同周唯一性校验**（后端）：同一学生同一 ISO 自然周仅可报 1 次，违反返回 403 | MUST |
| C5 | **名额校验**（后端）：已报人数 ≥ 名额时拒绝报名 | MUST |
| C6 | **截止时间校验**（后端）：距活动开始 < 24 小时拒绝报名 | MUST |
| C7 | 报名成功生成订单号（R + 8 位随机数字），自动归档学生姓名/学号/年级/邮箱 | MUST |
| C8 | 报名成功后异步发送通知邮件：学生一封 + 顾问一封（邮件发送失败不阻塞报名） | MUST |

**错误行为**

- 同周已报名 → 403（含冲突活动信息）
- 名额已满 → 403
- 已过报名截止时间 → 403
- 活动或用户不存在 → 404

---

### 模块 D：学生端 · 报名记录管理

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| D1 | "My Records" 页面分页展示本人历史报名记录 | MUST |
| D2 | 列表字段：Order # / Activity Name / Date / Time / Topic / Actions | MUST |
| D3 | **取消报名**：距活动结束 ≥ 4 小时可取消；< 4 小时禁止取消（前后端均需校验） | MUST |
| D4 | 取消需二次确认弹窗 | MUST |
| D5 | 取消后删除报名记录，发送取消通知邮件给学生 + 顾问 | MUST |

**错误行为**

- 报名记录不存在 → 404
- 距活动结束 < 4 小时 → 403（禁止取消）

---

### 模块 E：管理后台 · 项目管理

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| E1 | 项目列表：分页展示，支持按时间区间筛选，含 Edit / Delete 操作 | MUST |
| E2 | 项目字段：名称（唯一）、富文本内容、名额、所属顾问 | MUST |
| E3 | 新增/编辑项目：弹窗表单，名称唯一校验；顾问下拉从顾问信息表加载 | MUST |
| E4 | 富文本编辑器支持：标题、字号、颜色、对齐、图片嵌入、链接 | MUST |
| E5 | 富文本内容保存前经后端 HTML 消毒（移除 script/iframe/事件处理器） | MUST |
| E6 | 删除项目需二次确认，级联删除其下所有活动及对应报名记录 | MUST |
| E7 | 提供独立顾问列表查询接口 | MUST |

**错误行为**

- 项目名重复 → 409
- 必填字段为空 → 400
- 项目不存在 → 404

---

### 模块 F：管理后台 · 活动管理

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| F1 | 活动列表：分页展示，含活动名/关联项目/名额/已报人数/活动时间/报名时间 | MUST |
| F2 | 列表每行提供报名详情入口链接 | MUST |
| F3 | 新增/编辑活动：弹窗表单，关联项目、活动起止时间、报名起止时间 | MUST |
| F4 | 时间校验：活动开始 ≤ 活动结束、报名开始 ≤ 报名结束（前后端均校验） | MUST |
| F5 | **批量排期上传**：提供 Excel 模板下载（14 天 × 14 时段），管理员填写后上传 | MUST |
| F6 | 上传逻辑：同项目 + 同开始时间的活动更新，否则新增（去重） | MUST |
| F7 | 上传结果返回成功/失败计数 | MUST |
| F8 | 上传文件限制：仅 `.xlsx` 格式，解码后 ≤ 10MB | MUST |
| F9 | 活动报名明细页：顶部摘要（活动名/名额/已报/状态）+ 分页报名表格 | MUST |
| F10 | 删除活动需二次确认，级联删除其下所有报名记录 | MUST |

**批量排期模板规范**

- 模板结构：14 列（当日 + 未来 13 天）× 14 行（时段 08:00-09:00 ~ 21:00-22:00）
- 行头：日期 + 星期
- 列头：时段标签
- 数据区：填入项目名称（对应已存在的项目），空单元格跳过
- 单单元格可含多个项目名（换行分隔），每个项目名生成一个独立活动

---

### 模块 G：管理后台 · 数据导出与查询

**功能要求**

| 编号 | 需求 | 优先级 |
|------|------|--------|
| G1 | 报表导出：按时间区间筛选 + 活动名多选（模糊搜索 + 全选） | MUST |
| G2 | 勾选活动后联动展示对应报名明细预览 | MUST |
| G3 | 导出生成 Excel 文件（base64 编码），前端自动触发下载 | MUST |
| G4 | 导出字段：序号 / Activity Name / Order # / Name / Student ID / Grade / Email / Time / Info | MUST |
| G5 | **跨活动查询**：按活动名多选 + 时间区间查询报名数据，结果支持分页 + 下载 | MUST |
| G6 | 活动名模糊搜索仅返回已有报名记录的活动名 | MUST |

---

### 模块 H：定时邮件自动化

> 以下定时任务由操作系统 cron 调度执行，非应用内触发。乙方需交付独立可运行的脚本。

| 编号 | 需求 | 周期 | 触发条件 | 收件人 | 优先级 |
|------|------|------|----------|--------|--------|
| H1 | **学生活动提醒** | 每天 21:00 | 活动开始日期 = 次日 | 报名学生 | MUST |
| H2 | **顾问活动提醒** | 每天 21:00 | 活动开始日期 = 次日 | 对应项目顾问 | MUST |
| H3 | **反馈问卷推送** | 每 2 小时 | 活动结束 ≥ 2 小时 且 未发过问卷 | 报名学生 | MUST |

**通用要求**

| 项目 | 要求 |
|------|------|
| 发件人 | `careersme@cuhk.edu.cn` |
| SMTP 连接 | `mail.cuhk.edu.cn:587`，STARTTLS |
| 邮件模板 | 从 `aa_html_template` 表读取（按 type 区分：reminder-student / reminder-teacher / question 等） |
| 模板变量 | 支持 `{_title}`, `{_date}`, `{_start_time}`, `{_end_time}` 等占位符替换 |
| 失败处理 | 邮件发送失败仅记录日志，不中断脚本执行 |
| 去重保证 | 问卷邮件通过 `send_question` 字段标记，同一报名仅发送一次 |
| 数据库凭证 | 通过环境变量注入，禁止硬编码 |

**注意事项**

- 脚本需独立管理数据库连接（非复用应用连接池），执行完毕后断开
- 乙方需评估大数据量场景下的查询效率，选择合理的分批处理策略
- 问卷去重逻辑需考虑并发安全性（同一报名不被重复发送）

---

## 5. UI/UX 范式要求

### 5.1 整体风格

- **主题**：浅色主题（白色背景 `#fff` + 紫色品牌色 `#763890`）
- **品牌条**：顶部紫色横幅 "SME IAO ALUMNI ADVISING"，白色文字，24px 字号
- **配色方案**：Open（绿色 success）、Full（红色 danger）、Closed（灰色默认）
- **响应式**：桌面端优先（1200px+），支持平板（768px+）

### 5.2 学生端布局规范

- **顶部**：品牌横幅 + 搜索栏（时间区间 + 模糊搜索 + Search 按钮）+ My Records 按钮（右侧）
- **中间**：日期/星期显示 + 列表/日历视图 RadioGroup 切换
- **列表视图**：HeroUI Table + 底部分页（Previous/Next + 页码）
- **日历视图**：FullCalendar + 导航栏（Prev/Next/Today + Month/Week/Day 切换）
- **报名页**：活动名称 + 富文本内容 + 话题选择 + Submit 按钮
- **记录页**：分页表格 + Cancel 按钮（<4h 禁用）

### 5.3 管理端布局规范

- **左侧导航**：项目管理 / 活动管理 / 报表导出 / 数据查询
- **顶部**：管理端 Logo + 登出按钮
- **表格**：HeroUI Table + 分页（默认 10 条/页）
- **弹窗**：HeroUI Modal（新增/编辑/删除确认）
- **活动详情页**：顶部"四宫格摘要" + 下方报名表格

### 5.4 交互规范

| 场景 | 实现 |
|------|------|
| 加载态 | Table loading + 日历半透明 (`opacity-50`) + 按钮 disabled |
| 空态 | HeroUI Table `renderEmptyState` → "No Data" |
| 确认操作 | HeroUI Modal 二次确认（删除/登出/取消报名） |
| 401 错误 | 全局 `handleSessionExpired()` → 清空 localStorage → 跳转登录 |
| 错误提示 | 内联 error message 或 HeroUI Toast |
| 日历加载 | 请求期间 `pointer-events-none` |

### 5.5 关键组件清单

| 组件 | 路径 | 依赖 |
|------|------|------|
| AuthGuard | `web/src/components/AuthGuard.tsx` | — |
| CalendarComponent | `web/src/components/aa/CalendarComponent.tsx` | FullCalendar |
| RichTextEditor | `web/src/components/aa/RichTextEditor.tsx` | Quill 2.x |
| LoginView | `web/src/views/LoginView.tsx` | HeroUI TextField/Input/Button |
| LogoutView | `web/src/views/LogoutView.tsx` | HeroUI Modal/Button |
| UserHomeView | `web/src/views/UserHomeView.tsx` | HeroUI Table/Pagination/Radio/Chip |
| UserApplyView | `web/src/views/UserApplyView.tsx` | HeroUI Button/Chip |
| UserApplyRecordView | `web/src/views/UserApplyRecordView.tsx` | HeroUI Table/Pagination/Modal |
| UserHomeOauth | `web/src/views/UserHomeOauth.tsx` | —（SSO 回调处理） |
| ProjectManagementView | `web/src/views/ProjectManagementView.tsx` | HeroUI Table/Modal/Pagination |
| ActivityManagementView | `web/src/views/ActivityManagementView.tsx` | HeroUI Table/Modal/Pagination |
| ActivityManagementDetailView | `web/src/views/ActivityManagementDetailView.tsx` | HeroUI Table/Card |
| ReportExportView | `web/src/views/ReportExportView.tsx` | HeroUI Checkbox/Button/Modal |
| QueryManagementView | `web/src/views/QueryManagementView.tsx` | HeroUI Table/Checkbox/Pagination |

---

## 6. 数据模型

### 6.1 数据库表

#### 表 1: `aa_enlist_user` — 用户表

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | Integer PK | autoincrement | 用户 ID |
| username | String(255) | "N/A" | 用户名（管理员=账号；学生=ADFS upn） |
| password | String(255) | "N/A" | PBKDF2 哈希（学生 "N/A"） |
| role | String(255) | "user" | admin / user |
| key | Text | "N/A" | 服务端签发 session token |
| name | String(255) | "N/A" | 姓名 |
| grade | String(255) | "N/A" | 年级 |
| number | String(255) | "N/A" | 学号 |
| email | String(255) | "N/A" | 邮箱 |
| time | DateTime | now | 登录时间 |

#### 表 2: `aa_enlist_project` — 项目表（咨询主题）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | Integer PK | autoincrement | 项目 ID |
| name | String(255) UNIQUE | "N/A" | 项目名称 |
| quota | String(255) | "N/A" | 名额 |
| content | Text | "N/A" | 富文本内容 |
| content_ex_id | Integer FK→content | NULL | 扩展内容关联 |
| owner | String(255) | "N/A" | 所属顾问 |
| update | DateTime | now | 最后更新 |
| time | DateTime | now | 创建时间 |

#### 表 3: `aa_enlist_activity` — 活动表（排期）

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | Integer PK | autoincrement | 活动 ID |
| name | String(255) | "N/A" | 活动名称（同关联项目名） |
| project_id | Integer FK→project | NULL | 关联项目 |
| activity_start_time | DateTime | NULL | 活动开始 |
| activity_end_time | DateTime | NULL | 活动结束 |
| apply_start_time | DateTime | NULL | 报名开始 |
| apply_end_time | DateTime | NULL | 报名结束 |
| time | DateTime | now | 创建时间 |
| update | DateTime | now | 更新时间 |

#### 表 4: `aa_enlist_apply` — 报名表

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | Integer PK | autoincrement | 报名 ID |
| project_id | Integer FK→project | NULL | 关联项目 |
| activity_id | Integer FK→activity | NULL | 关联活动 |
| user_id | **String(255)** | "N/A" | **用户 ID（String 类型！）** |
| order | String(255) | "N/A" | 订单号 R+8 数字 |
| name | String(255) | "N/A" | 姓名快照 |
| number | String(255) | "N/A" | 学号快照 |
| grade | String(255) | "N/A" | 年级快照 |
| email | String(255) | "N/A" | 邮箱快照 |
| time | DateTime | now | 报名时间 |
| state | String(255) | "N/A" | 状态 |
| info_1 | String(255) | "N/A" | 咨询话题 |
| info_2~8 | String(255) | "N/A" | 预留字段 |
| send_question | String(255) | "False" | 问卷已发标记 |

#### 表 5: `aa_enlist_content` — 内容表

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | Integer PK | autoincrement | ID |
| content | Text | "N/A" | JSON 扩展内容 |
| time | DateTime | now | 时间 |

#### 表 6: `aa_html_template` — 邮件模板表

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | Integer PK | autoincrement | ID |
| type | String(255) | "N/A" | submit / submit_ex / cancel / cancel_ex / reminder-student / reminder-teacher / question |
| name | String(255) | "N/A" | 模板名称 |
| html | Text | "N/A" | HTML（支持 `{_title}` 等 `.format()` 占位） |

#### 表 7: `aa_owner_info` — 顾问信息表

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | Integer PK | autoincrement | ID |
| name | String(255) | "N/A" | 顾问姓名 |
| email | String(255) | "N/A" | 顾问邮箱 |

### 6.2 数据关系

```
aa_enlist_project ──1:N──> aa_enlist_activity ──1:N──> aa_enlist_apply
      │                         │                         │
      │ FK content_ex_id        │                         │ user_id (String)
      ↓                         │                         ↓
aa_enlist_content               │                    aa_enlist_user
                                │
      aa_enlist_project.owner ──参照──> aa_owner_info.name
```

### 6.3 序列化要求

- ORM 模型提供 `to_dict()` 方法（遍历 `__table__.columns`）
- GraphQL 响应格式：
  - 业务操作 → `ApiResponse { code: Int, msg: String, data: JSON }`
  - 文件操作 → `FileResponse { code: Int, msg: String, fileName: String, fileBase64: String }`
- 前端 `callApi()` 自动解包 `ApiResponse.data`；`callFileApi()` 返回完整 `FileResponse`
- **注意**：`ApiResponse.data` 为 Strawberry `JSON` scalar，与 Python `dict` 兼容

---

## 7. API 接口规范

### 7.1 通用规范

- **统一端点**：`POST /{route_prefix}/graphql`
- **请求头**：`Content-Type: application/json; charset=UTF-8` + `Token: {session_key}`
- **响应码体系**：

| code | 含义 | 触发场景 |
|------|------|----------|
| 200 | 成功 | data 含业务数据 |
| 400 | 请求无效 | 参数不合法 / 文件格式错误 / RSA 解密失败 |
| 401 | Token Error | Token 缺失/无效/过期 |
| 403 | 禁止 | 同周重复报名 / 无权限 |
| 404 | 不存在 | 资源不存在 |
| 423 | 锁定 | 登录失败过多，账号锁定 |
| 428 | 需要验证码 | 连续失败达验证码门槛 |
| 500 | 服务器错误 | 内部异常 |

### 7.2 Query 接口清单（共 20 个）

| # | Field | Input | Auth | 说明 |
|---|-------|-------|------|------|
| 1 | `health` | — | 无 | 健康检查 |
| 2 | `loginKey` | — | 无 | RSA 公钥 |
| 3 | `userActivityList` | UserActivityListInput | Token | 活动列表 |
| 4 | `userActivitySearch` | activityId: Int | Token | 活动详情 |
| 5 | `userActivityFuzzyName` | FuzzyNameInput | Token | 活动名搜索 |
| 6 | `userActivityDetail` | UserRecordsInput | Token+User | 报名记录 |
| 7 | `manageProjectList` | PageInput | Admin | 项目列表 |
| 8 | `manageProjectSearch` | ProjectIdInput | Admin | 项目详情 |
| 9 | `manageProjectOwnerSearch` | — | Admin | 顾问列表 |
| 10 | `manageProjectNameList` | — | Admin | 项目名列表 |
| 11 | `manageActivityList` | PageInput | Admin | 活动列表 |
| 12 | `manageActivityDetail` | activityId: Int | Admin | 报名明细 |
| 13 | `manageActivityNameList` | ActivityNameListInput | Admin | 活动名列表 |
| 14 | `manageActivitySearch` | ActivityIdInput | Admin | 活动详情 |
| 15 | `manageActivityExport` | ActivityExportInput | Admin | 导出 Excel |
| 16 | `manageActivityExportFuzzyName` | FuzzyNameInput | Admin | 导出搜索 |
| 17 | `manageActivityDownload` | — | Admin | 排期模板 |
| 18 | `queryTitleSearch` | — | Admin | 全部标题 |
| 19 | `queryDataSearch` | QueryDataInput | Admin | 跨活动查询 |
| 20 | `queryDataDownload` | TitleListInput | Admin | 跨活动下载 |

### 7.3 Mutation 接口清单（共 12 个）

| # | Field | Input | Auth | 说明 |
|---|-------|-------|------|------|
| 1 | `login` | LoginInput | 无 | 管理员登录 |
| 2 | `logout` | LogoutInput | Token+User | 登出 |
| 3 | `userActivityOauth` | OauthInput | 无 | 学生 SSO |
| 4 | `userActivityApply` | UserActivityApplyInput | Token+User | 提交报名 |
| 5 | `userActivityDelete` | UserApplyDeleteInput | Token+User | 取消报名 |
| 6 | `manageProjectCreate` | ProjectCreateInput | Admin | 创建项目 |
| 7 | `manageProjectUpdate` | ProjectUpdateInput | Admin | 更新项目 |
| 8 | `manageProjectDelete` | ProjectIdInput | Admin | 删除项目 |
| 9 | `manageActivityCreate` | ActivityCreateInput | Admin | 创建活动 |
| 10 | `manageActivityUpdate` | ActivityUpdateInput | Admin | 更新活动 |
| 11 | `manageActivityDelete` | ActivityIdInput | Admin | 删除活动 |
| 12 | `manageActivityUpload` | fileName+fileBase64+contentType | Admin | 批量上传 |

---

## 8. 安全要求

### 8.1 认证安全

- 密码存储：PBKDF2-HMAC-SHA256（100,000 迭代）；旧明文自动迁移
- 传输加密：RSA-2048 OAEP(SHA-256)，密钥内存驻留，重启轮换
- 防暴力破解：5 次失败锁定 10 分钟，3 次失败触发图形验证码
- 防用户名枚举：假密码校验（`_DUMMY_HASH`）抹平时序
- 验证码：一次性使用，300s TTL，SVG 含干扰
- 会话管理：服务端签发 32 字节 token，Header `Token` 传递
- SSO 安全：code+client_secret 换 id_token，后端验签，独立签发 session token

### 8.2 GraphQL 安全

- `DisableIntrospection()` — 关闭 schema 探测
- `QueryDepthLimiter(max_depth=8)` — 防深层嵌套 DoS
- `allow_queries_via_get=False` — 仅接受 POST
- `graphql_ide=None` — 禁止 GraphiQL
- 参数上限：`MAX_PAGE_LIMIT=100`、`MAX_LIST_ITEMS=200`

### 8.3 传输与存储

- 所有 GraphQL 仅 POST
- 敏感配置全部环境变量注入（不硬编码）
- 邮件密码从 `ops/.env` 读取
- 邮件头注入防护：`_sanitize_header()` 剔除 CR/LF

### 8.4 前端安全

- 富文本：DOMPurify 消毒后渲染
- XSS：禁止裸 `innerHTML`
- CSRF：OAuth state 参数
- 路由守卫：AuthGuard 校验 token+role
- 错误提示不暴露后端细节

### 8.5 基础设施

- PostgreSQL 端口不对外暴露
- 环境变量通过 podman-compose `env_file` 注入
- HAProxy 作为唯一对外入口（端口 8003）

---

## 9. 业务规则

### 9.1 时间规则

| 规则 | 条件 |
|------|------|
| 活动展示 | `activity_start_time >= 当日 00:00` |
| 列表 Closed | `now >= activity_start_time - 1天` |
| 详情 Closed | `now >= activity_end_time` |
| Full | `number >= quota` |
| 同周唯一 | 同一 ISO(year, week) 仅 1 次报名 |
| 取消时限 | 活动开始前 ≥ 4h（**前端拦截，后端待增强**） |
| 报名截止 | `apply_end_time`（批量上传时 = activity_start_time - 24h） |
| 问卷触发 | 活动结束后 ≥ 2h |
| 提醒发送 | 活动前一天 21:00 |

### 9.2 状态机

```
活动（学生端列表）:
  Open(1) → Full(2) [number >= quota]
  Open(1) → Closed(0) [now >= start - 1天]
  Full(2) → Closed(0) [now >= start - 1天]

活动（详情页）:
  Open(1) → Closed(0) [now >= end_time]

问卷: send_question "False" → "True" [脚本触发]
```

### 9.3 级联规则

| 操作 | 级联影响 |
|------|----------|
| 删项目 | 删其下所有活动 → 删所有报名 |
| 删活动 | 删其下所有报名 |
| 删报名 | 仅删该记录 |

### 9.4 订单号

- 格式：`R` + 8 位随机数字（`secrets.choice(string.digits)`）
- 后端生成（`view_user_activity_apply`）

---

## 10. 部署与运维要求

### 10.1 容器编排

```yaml
services:
  db:       postgres:18        (:5432, Pod 内)
  service:  id_x_003_service   (:7000, Litestar)
  web:      id_x_003_web       (:2000, Next.js)
  haproxy:  haproxy:3.2        (:8003, 统一入口)
```

### 10.2 环境变量清单

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `POSTGRES_PASSWORD` | DB 密码 | MUST |
| `AA_MAIL_SERVER` | SMTP 服务器 | mail.cuhk.edu.cn |
| `AA_MAIL_PORT` | SMTP 端口 | 587 |
| `AA_MAIL_USER` | SMTP 账号 | careersme@cuhk.edu.cn |
| `AA_MAIL_PASSWORD` | SMTP 密码 | MUST |
| `AA_MAIL_FROM` | 发件人 | 同 AA_MAIL_USER |
| `AA_OAUTH_CLIENT_ID` | ADFS Client ID | MUST（SSO） |
| `AA_OAUTH_CLIENT_SECRET` | ADFS Secret | MUST（SSO） |
| `AA_OAUTH_REDIRECT_URI` | ADFS 回调 | MUST（SSO） |
| `AA_LOGIN_MAX_FAILURES` | 锁定阈值 | 5 |
| `AA_LOGIN_LOCK_SECONDS` | 锁定秒数 | 600 |
| `AA_CAPTCHA_AFTER_FAILURES` | 验证码阈值 | 3 |
| `AA_MAX_UPLOAD_BYTES` | 上传大小上限 | 10MB |
| `DATABASE_URL` | asyncpg 连接串 | 框架注入 |

### 10.3 日志

- 后端：`utils/log_util.py` 统一 logger，每行带 `request_id`
- 关键路径：登录、报名、邮件、上传、批量操作

### 10.4 Cron 任务

| 任务 | 周期 | 脚本 |
|------|------|------|
| 学生提醒 | 每天 21:00 | `send_reminder_mail_student.py` |
| 顾问提醒 | 每天 21:00 | `send_reminder_mail_advisor.py` |
| 反馈问卷 | 每 2h | `send_question_mail.py` |

---

## 11. 非功能性需求

### 11.1 性能

- 分页默认 10 条/页，最大 100 条/页
- **潜在瓶颈**：`manageActivityList` 每行 COUNT（N+1）；`queryDataSearch` 内存排序+分页

### 11.2 可靠性

- 邮件失败不阻断业务（异步+容错）
- 取消操作 commit 后才发邮件
- async_sessionmaker 管理连接

### 11.3 兼容性

- 浏览器：Chrome / Firefox / Safari / Edge 最新两版
- 后端：Python 3.12+

### 11.4 可维护性

- 四层分层 + 插件化 + 类型注解 + 模块级 docstring

---

## 12. 验收标准

### 12.1 核心流程验收（MUST PASS）

| # | 场景 | 预期 |
|---|------|------|
| 1 | 管理员登录（正确密码） | 200 → token，跳转后台 |
| 2 | 登录失败 x3 | 401 + 弹出验证码 |
| 3 | 登录失败 x5 | 423 → 锁定 10min |
| 4 | 学生 SSO（新用户） | 自动建档 + token |
| 5 | 学生浏览活动列表 | 未来活动 + 正确着色 |
| 6 | 活动名模糊搜索 | 正确过滤 |
| 7 | 活动详情 + 话题选择 | 富文本渲染 + 话题 state 正确 |
| 8 | 学生报名 | 200 → 订单号 + 邮件 |
| 9 | 同周二次报名 | 403 |
| 10 | 取消报名（≥4h） | 删除 + 邮件 |
| 11 | 管理员 CRUD 项目 | 级联删除 |
| 12 | 管理员 CRUD 活动 | 级联删除 |
| 13 | 批量上传排期 | success/fail 计数 |
| 14 | 导出报名 Excel | 正确列+样式 |
| 15 | 跨活动查询 | 正确过滤+分页+下载 |

### 12.2 安全验收（MUST PASS）

| # | 场景 | 预期 |
|---|------|------|
| 1 | 未登录访问活动列表 | 401 → 跳转登录 |
| 2 | 学生 token 调管理接口 | 401 |
| 3 | GraphQL introspection | 禁用 |
| 4 | 深层嵌套查询 >8 | 拒绝 |
| 5 | GET /graphql?query=... | 拒绝 |
| 6 | 密码明文传输 | wire 上为 RSA 密文 |

### 12.3 UI 验收（MUST PASS）

| # | 场景 | 预期 |
|---|------|------|
| 1 | 列表/日历切换 | 无闪烁 |
| 2 | 分页 | 正确高亮 |
| 3 | FullCalendar 导航 | Prev/Next/Today 正常 |
| 4 | 二次确认弹窗 | Modal |
| 5 | Quill 工具栏 | 功能完整 |
| 6 | 验证码 SVG | 正确渲染 |

---

## 13. 附录：交付物清单

| # | 路径 | 描述 |
|---|------|------|
| 1 | `src/controllers/x_controllers.py` | GraphQL 路由层 |
| 2 | `src/views/x_views.py` | 全部业务逻辑 |
| 3 | `src/models/x_models.py` | ORM + Session 工厂 |
| 4 | `src/schemas/x_schemas.py` | GraphQL 类型 |
| 5 | `src/utils/x_crypto.py` | RSA 加密 |
| 6 | `src/utils/x_oauth.py` | ADFS OIDC |
| 7 | `src/x_plugin.py` | 插件入口 |
| 8 | `web/src/views/*.tsx` | 全部前端页面 |
| 9 | `web/src/components/*.tsx` | 共享组件 |
| 10 | `web/src/api/*.ts` | 前端 API 层 |
| 11 | `web/src/utils/crypto.ts` | 前端 RSA 加密 |
| 12 | `scripts/*.py` | 定时邮件（3 个） |
| 13 | `ops/podman-compose.yml` | 容器编排 |
| 14 | `ops/haproxy.cfg` | 代理配置 |
| 15 | `ops/Dockerfile.service` | 后端镜像 |
| 16 | `docs/REQUIREMENTS.md` | 本文档 |
| 17 | `docs/project.md` | 业务背景 |