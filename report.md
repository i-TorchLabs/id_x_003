# id_x_003 安全性审计与优化报告

日期：2026-08-13
范围：`x_models/id_x_003` 后端（GraphQL / SQLAlchemy）与前端（Next.js / React）

---

## 一、后端修复（`src/views/x_views.py`）

### 1. 硬编码 SMTP 密码（严重）
- **位置**：原 `MAIL_PASSWORD = "n04n8#X4O48@4Gh0oqw93"`（源码明文）。
- **修复**：邮件配置全部改为环境变量注入（`AA_MAIL_SERVER` / `AA_MAIL_PORT` / `AA_MAIL_USER` / `AA_MAIL_FROM` / `AA_MAIL_PASSWORD`），未配置密码时拒绝发信并记录错误。
- **联动**：`ops/.env.example` 新增对应配置项；`ops/up.sh` 与 `ops/podman-compose.yml` 增加 `AA_MAIL_PASSWORD` 环境变量透传。

### 2. 明文存储/比对登录密码（严重）
- **位置**：`view_login` 原以 `AaEnlistUser.password == password` 明文比对。
- **修复**：新增 `_hash_password()` / `_check_password()`（PBKDF2-HMAC-SHA256，16 字节随机盐，100,000 次迭代）。登录按用户名查询后做哈希校验；**旧明文记录在验证成功时自动迁移为哈希**（向后兼容，无需停机迁移脚本）。

### 3. 越权与缺失鉴权（严重）
- **学生端水平越权**：`view_user_activity_apply` / `view_user_activity_detail` / `view_user_activity_delete` 原完全不校验 Token，仅凭客户端传入的 `user_id` 即可代他人报名、查看、取消。修复后调用新增 `_verify_user()`：Token 必须属于该 `user_id`（admin 可代操作）。
- **学生可调用管理接口**：原 `_verify_token` 只校验 Token 存在于用户表，学生 OAuth 用户同样持有 key。修复后全部 `manage_*` 接口改用新增 `_verify_admin()`（要求 `role == "admin"`）。
- **完全无鉴权的接口**：以下接口原先**任何人无需登录即可调用**，已全部补上 `_verify_admin`：
  - `view_manage_project_owner_search`
  - `view_manage_activity_export`（导出含姓名/学号/邮箱的 Excel）
  - `view_manage_activity_export_fuzzy_name`
  - `view_manage_activity_download`
  - `view_query_title_search`
  - `view_query_data_search`（批量 PII 查询）
  - `view_query_data_download`
- **登出越权**：`view_logout` 原任何有效 Token 可将任意 `user_id` 登出，修复为 `_verify_user`（本人或 admin）。

### 4. OAuth Token 未校验（高危）
- **位置**：`view_user_activity_oauth` 原直接 `split(".")[1]` + `b64decode`，不校验结构、有效期，且把 IdP 原始 token 直接当会话凭证返回/存储。
- **修复**：新增 `_decode_oauth_payload()`：强制三段 JWT 结构、payload 必须含 `upn`/`email`、`exp` 未过期；会话凭证改为服务端签发的 `secrets.token_urlsafe(32)` 并写入 `key` 字段。
- **遗留项**：完整的 JWT **签名验证**需配置 ADFS 的 JWKS 公钥（建议引入 `PyJWT` + `PyJWKClient`），当前为结构/有效期级校验。

### 5. 邮件头注入（CRLF）
- **位置**：`mail_subject` 拼接了用户可控的 `user.name` / `owner.name`。
- **修复**：新增 `_sanitize_header()` 剔除 CR/LF，在 `_send_mail` 内统一清洗 subject/from/to/cc；OAuth 建档的 `upn`/`email`/`name` 同样清洗。

### 6. 订单号使用非加密随机数
- **位置**：`random.sample(string.digits, 8)`。
- **修复**：改为 `secrets.choice`，并移除 `random` 依赖。

### 7. 上传接口无大小限制（DoS）
- **位置**：`view_manage_activity_upload` 对 base64 载荷无限制（宿主 `MAX_REQUEST_BODY_SIZE` 为 1GB），且仅检查文件名含 "xlsx"。
- **修复**：解码前按 base64 体积估算限制（默认 10MB，`AA_MAX_UPLOAD_BYTES` 可调）；文件名校验改为严格 `.xlsx` 后缀。

---

## 二、前端修复（`web/src`）

### 1. 存储型 XSS（高危）
服务端富文本（管理端 Quill 编辑器产生）原样进入 `dangerouslySetInnerHTML` / `dangerouslyPasteHTML`：
- **新增** `src/utils/sanitize.ts`：基于 **DOMPurify**（新增依赖 `dompurify` + `@types/dompurify`）的 `sanitizeHtml()`，仅放行 HTML profile。
- `src/views/UserApplyView.tsx`：`activity_content` 渲染前消毒。
- `src/views/ProjectManagementView.tsx`：`project_content` 渲染前消毒。
- `src/components/aa/RichTextEditor.tsx`：`setContents()` 粘贴前消毒。
- `src/views/LogoutView.tsx`：移除不必要的 `dangerouslySetInnerHTML`（静态文案改纯文本）。

### 2. AuthGuard 校验失效
- **位置**：`src/components/AuthGuard.tsx` 读取 `localStorage.getItem("token")`，但实际凭证存于 `userInfo` JSON 中，导致守卫逻辑恒不成立。
- **修复**：改为解析 `userInfo.token` 并容错非法 JSON。

---

## 三、验证

- 后端：`py_compile` / `ast.parse` 语法校验通过；PBKDF2 哈希/校验/明文自动迁移逻辑经独立单元验证通过。
- 前端：`tsc --noEmit` 通过；`next build` 全量构建通过。

## 四、二次复检发现的逻辑漏洞与修复（2026-08-13 复审）

### 1. 报名/取消流程的空引用导致“操作已成功却返回 500”（逻辑漏洞）
- **报名** `view_user_activity_apply`：报名记录 `commit` 之后才查询 `project/owner` 并直接访问 `owner.email`。当项目被删或顾问未建档时抛 `AttributeError` → 进入 except 返回 500，但**记录已提交**，用户误以为失败而重复报名。修复：`project/owner` 逐级判空，顾问信息缺失时跳过顾问通知邮件并记录告警，学生邮件与成功响应不受影响。
- **取消** `view_user_activity_delete`：`activity.project_id`、`project.owner`、`owner.email` 链式访问无判空，活动/项目被级联删除后用户无法取消报名（500）。修复：逐级判空，取消操作照常执行，仅跳过顾问通知。

### 2. 环境变量解析可致服务启动崩溃
- `int(os.environ.get("AA_MAIL_PORT", ...))` / `AA_MAX_UPLOAD_BYTES` 在遇到非法值时于**模块导入期**抛 `ValueError`，整个服务无法启动。修复：新增 `_env_int()`，非法值回退默认值。

### 3. 登录接口用户名枚举（时序侧信道）
- 用户不存在时直接返回，存在时才做 PBKDF2 运算，响应时间差可枚举有效用户名。修复：用户不存在时对固定 `_DUMMY_HASH` 执行一次同等哈希运算抹平时序。

### 4. 空收件人仍触发 SMTP 登录
- `_send_mail` 在 `mail_to` 为空时仍会建立 SMTP 连接并登录。修复：收件人为空时直接跳过并告警。

## 五、三次复检发现的问题与修复（2026-08-13 三审）

### 1. 鉴权覆盖完整性核查（通过）
- 用 AST 静态扫描全部 31 个 `view_*`：所有 `manage_*`/`query_*` 均含 `_verify_admin`；涉及用户数据的 `apply`/`detail`/`delete`/`logout` 均含 `_verify_user`；公开接口（health/list/search/fuzzy_name/oauth/login）按设计保持匿名。无遗漏。

### 2. AuthGuard 重定向到不存在的路由（前端逻辑漏洞）
- `src/components/AuthGuard.tsx` 未登录跳转 `/f/login`，但实际登录页为 `/f/aa/login`，`/f/login` 在 `next.config.ts` 中无任何 rewrite/redirect，用户会落到 404。修复：改为 `/f/aa/login`。

### 3. OAuth 回调 hash 解析未做防御（前端逻辑漏洞）
- `src/views/UserHomeOauth.tsx` 中 `window.location.hash.split('#access_token=')[1].split(...)`：当 IdP 回调缺少 `access_token`（用户拒绝授权/错误重定向）时 `[1]` 为 `undefined`，同步抛出未捕获 `TypeError`，页面白屏且无提示。修复：改用正则匹配并判空，缺失时 toast 提示后返回。

## 六、四次复检发现的问题与修复（2026-08-13 四审）

### 1. 分页参数无边界 → 匿名内存 DoS / 负 OFFSET 500（后端逻辑漏洞）
- 6 处分页接口直接 `int(data.offset)` / `int(data.limit)` 送入 SQL。其中 `view_user_activity_list` 为**公开接口**：`limit=10^9` 可匿名触发全表拉取耗尽内存；`offset=0`/负数使 `(offset-1)*limit` 为负，SQL 抛错返回 500。
- 修复：新增 `_clamp_page()`（offset ≥ 1、1 ≤ limit ≤ 100，非法值回退默认），全部 6 处统一替换。

### 2. 毫秒时间戳解析未捕获异常 → 多接口可被非法输入打 500（后端健壮性）
- 7 处 `datetime.fromtimestamp(int(x)/1000)`：超大/非数字输入抛 `OverflowError/ValueError/OSError`，落入通用 except 返回 500（含公开的活动列表接口）。
- 修复：新增 `_ms_to_dt()` 安全解析（非法返回 `None`），全部调用点统一替换：列表/查询类接口解析失败则忽略时间过滤；活动创建/更新的非法时间字段置空；导出处原有 try 块一并简化。

### 3. 列表型入参无数量上限（导出/查询内存膨胀）
- `ActivityExportInput.activity_list`、`QueryDataInput.title`、`TitleListInput.title` 长度不限，可构造超长 `IN (...)` 查询与超大 Excel 导出。
- 修复：新增 `MAX_LIST_ITEMS = 200`，3 处入口超限直接返回 400。

验证：`_clamp_page`/`_ms_to_dt` 边界值单元验证通过；AST 检查确认 6 处分页替换完整、无残留裸 `fromtimestamp` 业务调用；`py_compile` 通过。

## 七、五次复检发现的问题与修复（2026-08-13 五审）

### 1. 取消报名：commit 后访问已删除 ORM 实例属性 → ObjectDeletedError 500（同类二轮漏洞的遗漏点）
- `view_user_activity_delete` 中 `session.delete(apply_obj)` + `commit()` 之后，顾问邮件的 `msg["_student_name"] = apply_obj.name` 仍会访问该实例。SQLAlchemy 默认 `expire_on_commit=True`，实例属性已过期，对已删除行的刷新触发 `ObjectDeletedError` → 取消实际成功却返回 500。
- 修复：删除前先将姓名缓存到局部变量 `apply_name`，commit 后仅使用该局部变量；并全局扫描确认其余删除均为 Core 批量 `delete()`（无实例属性访问），无同类残留。

### 2. 同周校验对历史空时间记录崩溃
- `view_user_activity_apply` 同周唯一性校验直接 `existing_applies[0].time.isocalendar()`，历史数据 `time` 为 NULL 时抛 `AttributeError` → 报名 500。
- 修复：校验条件增加 `existing_applies[0].time` 非空判断（空时间记录不参与同周限制）。

验证：`py_compile` 通过；awk 扫描确认 delete 之后不再存在任何 `apply_obj` 属性访问。

## 八、六次复检发现的问题与修复（2026-08-13 六审）

### 1. 批量上传：非法 base64 / 非法 Excel 直接 500
- `view_manage_activity_upload` 中 `base64.b64decode(file_base64)` 未校验，非法字符抛 `binascii.Error` → 500；`pd.read_excel` 对伪装 `.xlsx` 抛异常 → 500。
- 修复：`b64decode(..., validate=True)` 与 `read_excel` 分别包裹，失败返回 400（"文件内容不是合法的 base64" / "无法解析的 Excel 文件"）。

### 2. 批量上传：单元格解析异常导致整批上传崩溃
- 单元格解析（`column.split(".")[1]`、`date.split("-")`、`strptime` 等）位于 inner try 之外：模板列名不含 "."、Date 列缺失等坏行会抛 `IndexError/AttributeError`，直接中断整个上传并返回 500，已处理行与失败计数全部丢失。
- 修复：将解析与写库统一纳入逐单元格 try/except，单行失败仅计入 `fail_num` 并回滚该行，不中断整批；日志改用单元格原始值避免引用未绑定变量。

验证：非法 base64 拦截、坏列名/缺 Date 行计入失败的兜底路径均经独立模拟验证；`py_compile` 通过。

## 九、七次复检发现的问题与修复（2026-08-13 七审）

### 1. 客户端字符串 ID 直接与 Integer 列比较 → 非法输入触发数据库类型错误 500
- GraphQL 入参的 `project_id` / `activity_id` / `apply_id` 均为 `str`，直接用于 `Integer` 列比较（如 `AaEnlistActivity.id == activity_id`）。非数字输入触发 asyncpg `invalid input syntax` → 500。涉及 7 处管理接口及公开接口 `user_activity_search`、登录态接口 `apply`/`delete`/`logout`/`manage_activity_detail`。
- 修复：新增 `_to_int()`（非法返回 `None`），11 处调用点统一转换并在入口处返回 400/404；`manage_activity_detail` 等 resolver 直传参数同样覆盖。

### 2. `project.quota` 为 String 列，`int()` 解析遇非数字录入 → 公开接口 500
- `view_user_activity_list` / `view_user_activity_search` 中 `int(project.quota)`，管理员若录入非数字（如 "N/A"），学生活动列表/详情（公开接口）直接 500。
- 修复：改用 `_to_int(project.quota) or 0`，语义与原逻辑等价（空/非数字按 0 处理）。

### 3. AuthGuard 未被任何页面引用（记录项）
- `web/src/components/AuthGuard.tsx` 为死代码（无引用）；路由保护实际依赖后端鉴权（本轮已完备），前端守卫缺失不影响安全性，仅影响未登录体验。记录备查，不强行改动页面结构。

验证：`_to_int` 边界与 quota 语义等价性单测通过；全量 grep 确认用户可控字符串 ID 与 int 列的比较点均已收敛；`py_compile`、前端 `tsc --noEmit` 通过。

## 十、八次复检：端到端实测（2026-08-13 八审）

本轮以重建后的容器化部署对全部关键修复做线上实测（GraphQL over HAProxy），静态审查未发现新逻辑漏洞。实测结果：

| # | 场景 | 期望 | 实测 |
|---|------|------|------|
| 0 | 健康检查 | 200 ok | ✅ 通过 |
| 1 | 无 Token 调用管理接口 | 401 Token Error | ✅ 通过 |
| 2 | 匿名导出 PII Excel | 401 Token Error | ✅ 通过 |
| 3 | 公开列表 `limit=10^9` | 200 且被钳制 | ✅ 通过（不再全表拉取） |
| 4 | 非法 `activity_id="abc"` | 404 而非 500 | ✅ 通过 |
| 5 | 超大/非法时间戳 | 200 忽略过滤 | ✅ 通过 |
| 6 | 伪造 OAuth token（畸形） | 401 Invalid | ✅ 通过 |
| 7 | 结构合法但无签名的 JWT | 拒绝 | ⚠️ 仍返回 200（**已知遗留项**：需 IdP JWKS 验签，见遗留建议；测试产生的攻击者账号已从库中清除） |
| 8 | 负 `offset`/`limit` | 200 钳制为合法值 | ✅ 通过 |

实测期间服务日志无 error 记录，四容器（db/web/haproxy/service）均 healthy。

## 十一、九次复检发现的问题与修复（2026-08-13 九审）

### 1. OAuth 用户登出后被永久锁定（逻辑漏洞，本轮唯一新发现）
- 原逻辑：老用户 `key == "N/A"` 时返回 `check=false` 且不签发新会话密钥。而 `view_logout` 正是将 `key` 置为 `"N/A"`——**任何 OAuth 用户只要登出一次，就永远无法再次登录**（老系统返回的 token 也无法通过鉴权，同样锁定）。
- 修复：OAuth 断言本身即认证，老用户（含 `key="N/A"`）统一签发新会话密钥并返回 `check=true`，消除永久锁定分支。

### 2. 完整认证链路端到端实测（13 项全部通过）
预置 admin（旧明文密码）+ 两名学生，实测：

| # | 场景 | 结果 |
|---|------|------|
| 1 | 管理员旧明文密码登录 | ✅ 200，签发会话密钥 |
| 2 | 登录后密码自动迁移 | ✅ 库中已变为 `pbkdf2$...` |
| 3 | 二次登录（哈希校验路径） | ✅ 200 |
| 4 | 错误密码 | ✅ 401 |
| 5 | 不存在用户（时序抹平路径） | ✅ 401 |
| 6 | admin token 调管理接口 | ✅ 200 |
| 7 | 学生 token 调管理接口 | ✅ 401（角色拦截） |
| 8 | 学生 A 查学生 B 的记录 | ✅ 401（越权拦截） |
| 9 | 学生 A 查自己 | ✅ 200 |
| 10 | 学生 B 登出学生 A | ✅ 401（越权拦截） |
| 11 | 学生 A 登出自己 | ✅ 200 |
| 12 | 登出后旧 token 调用 | ✅ 401（密钥已失效） |
| 13 | 已登出用户 OAuth 重新登录 | ✅ check=true 签发新密钥（修复点） |

测试数据（admin_t/stu_a/stu_b）已全部清理。

## 十二、遗留建议（本次未实施）

0. **既有集成问题（审计发现，与本次安全改动无关）**：前端 `src/api/url.ts` 仍以 REST 路径（如 `/user/acitvity/apply`，baseURL `/b/sme/aa/enlist`）调用，而后端仅暴露 GraphQL `/b/id_x_003/graphql`。前端需改造为 GraphQL 请求，或后端增加 REST 兼容层，否则接口实际不可达。

1. **OAuth JWT 签名验证**：接入 ADFS JWKS（`PyJWT` + `PyJWKClient`）做完整验签与 `aud`/`iss` 校验。
2. **登录限流**：`login` 目前无失败次数限制，建议在网关或视图层加速率限制。
3. **Token 过期机制**：会话 key 目前长期有效，建议增加 `time` 字段的过期判断。
4. **Token 存储**：前端 token 存于 `localStorage`，XSS 发生时会被窃取；长期建议改 HttpOnly Cookie + CSRF 防护。
5. **历史明文密码**：首次登录后自动迁移，但长期未登录账号仍为明文，建议后续强制重置。
6. **已泄露的 SMTP 密码**（原硬编码值已进入 git 历史）应立即在邮件系统侧作废更换。
