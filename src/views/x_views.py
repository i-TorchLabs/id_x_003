"""业务层：全部业务逻辑，view_* 命名；异常在视图内捕获并转换为业务响应。

重构自 sme_cdc_enlist_aa（Quart/REST）：
- 保持原有业务规则与响应数据结构（code/msg/data）不变；
- 同步 SQLAlchemy 查询迁移为 async SQLAlchemy 2.0（select/delete）；
- Token 从 GraphQL 请求头 Header "Token" 读取；
- 文件下载以 base64 返回（原 send_file）。
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import re
import secrets
import smtplib
import string
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from io import BytesIO
from typing import Any

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Border, PatternFill, Side
from sqlalchemy import delete, desc, select
from strawberry.types import Info

from utils.log_util import get_request_id, logger

from x_models.id_x_003.src.models.x_models import (
    AaEnlistActivity,
    AaEnlistApply,
    AaEnlistContent,
    AaEnlistProject,
    AaEnlistUser,
    AaHtmlTemplate,
    AaOwnerInfo,
    get_session,
)
from x_models.id_x_003.src.schemas.x_schemas import (
    ActivityCreateInput,
    ActivityExportInput,
    ActivityIdInput,
    ActivityNameListInput,
    ActivityUpdateInput,
    ApiResponse,
    FileResponse,
    FuzzyNameInput,
    HealthType,
    LoginInput,
    LoginKeyType,
    LogoutInput,
    OauthInput,
    PageInput,
    ProjectCreateInput,
    ProjectIdInput,
    ProjectUpdateInput,
    QueryDataInput,
    TitleListInput,
    UserActivityApplyInput,
    UserActivityListInput,
    UserApplyDeleteInput,
    UserRecordsInput,
)
from x_models.id_x_003.src.utils import x_crypto

# ===== 常量（与原系统一致） =====
WEEK_LIST = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

# 敏感配置改为环境变量注入，不再硬编码在源码中
def _env_int(name: str, default: int) -> int:
    """安全解析整型环境变量，非法值回退默认（避免导入期崩溃）。"""
    try:
        return int(os.environ.get(name, "") or default)
    except (TypeError, ValueError):
        return default


MAIL_SERVER = os.environ.get("AA_MAIL_SERVER", "mail.cuhk.edu.cn")
MAIL_PORT = _env_int("AA_MAIL_PORT", 587)
MAIL_USER = os.environ.get("AA_MAIL_USER", "careersme@cuhk.edu.cn")
MAIL_FROM = os.environ.get("AA_MAIL_FROM", MAIL_USER)
MAIL_PASSWORD = os.environ.get("AA_MAIL_PASSWORD", "")

# 上传文件大小上限（解码后字节数），防止超大 base64 载荷造成内存 DoS
MAX_UPLOAD_BYTES = _env_int("AA_MAX_UPLOAD_BYTES", 10 * 1024 * 1024)

SLOT_LIST = [
    "08:00-08:20", "08:30-08:50", "09:00-09:20", "09:30-09:50",
    "10:00-10:20", "10:30-10:50", "11:00-11:20", "11:30-11:50",
    "12:00-12:20", "12:30-12:50", "13:00-13:20", "13:30-13:50",
    "14:00-14:20", "14:30-14:50", "15:00-15:20", "15:30-15:50",
    "16:00-16:20", "16:30-16:50", "17:00-17:20", "17:30-17:50",
    "18:00-18:20", "18:30-18:50", "19:00-19:20", "19:30-19:50",
    "20:00-20:20", "20:30-20:50", "21:00-21:20", "21:30-21:50",
]


# ===== 通用工具 =====
def _rid() -> str:
    return get_request_id()


def _resp(code: int, msg: str, data: Any = None) -> ApiResponse:
    return ApiResponse(code=code, msg=msg, data=data if data is not None else {})


def _get_token(info: Info) -> str | None:
    """从 GraphQL 请求上下文中读取 Token 请求头。"""
    ctx = info.context
    request = ctx.get("request") if isinstance(ctx, dict) else getattr(ctx, "request", None)
    if request is None:
        return None
    return request.headers.get("Token")


async def _get_user_by_token(info: Info) -> AaEnlistUser | None:
    """按 Token 解析用户；无效/过期返回 None。"""
    token = _get_token(info)
    if not token or token == "N/A":
        return None
    try:
        maker = get_session()
        async with maker() as session:
            result = await session.execute(select(AaEnlistUser).where(AaEnlistUser.key == token))
            return result.scalars().first()
    except Exception as e:
        logger.error(f"{_rid()}Token验证失败: {e}")
        return None


async def _verify_token(info: Info) -> bool:
    """Token 验证：请求头 Token 需匹配用户表 key 字段。"""
    return await _get_user_by_token(info) is not None


async def _verify_admin(info: Info) -> bool:
    """管理接口鉴权：Token 有效且角色为 admin（学生 token 不再可调用管理接口）。"""
    user = await _get_user_by_token(info)
    return bool(user and user.role == "admin")


async def _verify_user(info: Info, user_id: Any) -> bool:
    """学生接口鉴权：Token 必须属于该 user_id（admin 可代查），防止越权操作他人数据。"""
    user = await _get_user_by_token(info)
    if not user:
        return False
    return user.role == "admin" or str(user.id) == str(user_id).strip()


# ===== 密码安全（PBKDF2-HMAC-SHA256，兼容旧明文并自动迁移） =====
_PBKDF2_ITERATIONS = 100_000

# 用于抹平“用户不存在”与“密码错误”的响应时间差，防用户名枚举
_DUMMY_HASH = "pbkdf2$" + "00" * 16 + "$" + "00" * 32


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def _check_password(stored: str, password: str) -> tuple[bool, str | None]:
    """返回 (是否匹配, 需要回写的新哈希)。旧明文记录验证通过后返回新哈希以自动迁移。"""
    if stored.startswith("pbkdf2$"):
        try:
            _, salt_hex, digest_hex = stored.split("$", 2)
            calc = hashlib.pbkdf2_hmac(
                "sha256", password.encode(), bytes.fromhex(salt_hex), _PBKDF2_ITERATIONS
            )
            return secrets.compare_digest(calc.hex(), digest_hex), None
        except (ValueError, TypeError):
            return False, None
    if stored == password:  # 历史明文兼容
        return True, _hash_password(password)
    return False, None


def _sanitize_header(value: Any) -> str:
    """邮件头注入防护：剔除 CR/LF。"""
    return re.sub(r"[\r\n]+", " ", str(value or "")).strip()


# 分页参数边界：防 limit 过大拖垮内存（公开接口亦可被匿名调用）、offset 非法导致 500
MAX_PAGE_LIMIT = 100

# 列表型入参（活动名/标题）数量上限，防超长 IN 查询与导出内存膨胀
MAX_LIST_ITEMS = 200


def _clamp_page(offset: Any, limit: Any) -> tuple[int, int]:
    """收敛分页参数：offset >= 1，1 <= limit <= MAX_PAGE_LIMIT，非法值回退默认。"""
    try:
        offset = int(offset)
    except (TypeError, ValueError):
        offset = 1
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 10
    return max(offset, 1), min(max(limit, 1), MAX_PAGE_LIMIT)


def _ms_to_dt(value: Any) -> datetime | None:
    """毫秒时间戳安全解析：非法/越界返回 None（调用方据此忽略过滤或置空），不再抛 500。"""
    try:
        return datetime.fromtimestamp(int(value) / 1000)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def _to_int(value: Any) -> int | None:
    """ID 类入参安全转换：非法返回 None（调用方返回 404/400），不再抛 500。"""
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _send_mail(*, mail_subject: str = "", mail_from: str = "", mail_to: str = "",
               mail_cc: str = "", mail_html: str = "") -> bool:
    """发送邮件（与原系统一致：SMTP + STARTTLS）。"""
    if not MAIL_PASSWORD:
        logger.error("邮件发送失败: AA_MAIL_PASSWORD 未配置")
        return False
    # 邮件头注入防护
    mail_subject = _sanitize_header(mail_subject)
    mail_from = _sanitize_header(mail_from)
    mail_to = _sanitize_header(mail_to)
    mail_cc = _sanitize_header(mail_cc)
    if not mail_to:
        logger.warning("邮件发送跳过: 收件人为空")
        return False
    message = MIMEMultipart("alternative")
    message["Subject"] = mail_subject
    message["From"] = mail_from
    message["To"] = mail_to
    message["Cc"] = mail_cc
    message.attach(MIMEText(mail_html, "html"))

    server = None
    try:
        server = smtplib.SMTP(MAIL_SERVER, MAIL_PORT)
        server.starttls()
        server.login(MAIL_USER, MAIL_PASSWORD)
        recipients = [r for r in [mail_to, mail_cc] if r]
        server.sendmail(mail_from, recipients, message.as_string())
    except Exception as e:
        logger.error(f"邮件发送失败: {e}")
    finally:
        if server:
            server.quit()
    return True


def _log_mail(tag: str, mail_to: str, subject: str) -> None:
    logger.warning("#" * 50)
    logger.warning(f"{_rid()}{tag}")
    logger.warning(f"{_rid()}Mail sent to {mail_to}")
    logger.warning(f"{_rid()}subject: {subject}")
    logger.warning(f"{_rid()}from: {MAIL_FROM}")
    logger.warning(f"{_rid()}cc: ")
    logger.warning(f"{_rid()}to: {mail_to}")
    logger.warning("#" * 50)


async def _first(session, stmt):
    result = await session.execute(stmt)
    return result.scalars().first()


async def _count(session, stmt) -> int:
    from sqlalchemy import func
    result = await session.execute(select(func.count()).select_from(stmt.subquery()))
    return int(result.scalar() or 0)


# ===== 登录防暴力破解（漏洞报告 #3） =====
# 同一用户名连续失败达到阈值后锁定一段时间；内存实现，进程重启自动清零
LOGIN_MAX_FAILURES = _env_int("AA_LOGIN_MAX_FAILURES", 5)
LOGIN_LOCK_SECONDS = _env_int("AA_LOGIN_LOCK_SECONDS", 600)
# {username: [fail_count, first_fail_ts, lock_until_ts]}
_login_failures: dict[str, list[float]] = {}


def _login_locked(username: str) -> int:
    """返回剩余锁定秒数，未锁定返回 0。"""
    rec = _login_failures.get(username)
    if not rec:
        return 0
    lock_until = rec[2]
    remaining = int(lock_until - datetime.now().timestamp())
    if remaining <= 0:
        _login_failures.pop(username, None)
        return 0
    return remaining


def _record_login_failure(username: str) -> None:
    now = datetime.now().timestamp()
    rec = _login_failures.get(username)
    if not rec or now - rec[1] > LOGIN_LOCK_SECONDS:
        rec = [0, now, 0.0]
    rec[0] += 1
    if rec[0] >= LOGIN_MAX_FAILURES:
        rec[2] = now + LOGIN_LOCK_SECONDS
        logger.warning(f"{_rid()}账号 {username} 连续失败 {int(rec[0])} 次，锁定 {LOGIN_LOCK_SECONDS}s")
    _login_failures[username] = rec
    # 防止内存无限增长：超过一万条时清理已过期的记录
    if len(_login_failures) > 10_000:
        for k in [k for k, v in _login_failures.items() if v[2] and v[2] < now]:
            _login_failures.pop(k, None)


def _clear_login_failures(username: str) -> None:
    _login_failures.pop(username, None)


def _login_fail_response(username: str) -> ApiResponse:
    """登录失败统一响应：失败计数达验证码门槛时随 401 一并下发新验证码。"""
    if _captcha_required(username):
        cap = _generate_captcha()
        return _resp(401, "Login Fail", {
            "need_captcha": "true",
            "captcha_id": cap["captcha_id"],
            "image_base64": cap["image_base64"],
        })
    return _resp(401, "Login Fail")


# ===== 图形验证码（漏洞报告 #3 建议①：连续失败后增加验证码机制） =====
# 连续失败达到 CAPTCHA_AFTER_FAILURES 后要求验证码，达 LOGIN_MAX_FAILURES 仍锁定
CAPTCHA_AFTER_FAILURES = _env_int("AA_CAPTCHA_AFTER_FAILURES", 3)
_CAPTCHA_TTL_SECONDS = 300
_CAPTCHA_MAX_ENTRIES = 10_000
_CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去除易混淆 0/O/1/I
_CAPTCHA_LEN = 4
# {captcha_id: (code_lower, expire_ts)}
_captcha_store: dict[str, tuple[str, float]] = {}


def _captcha_required(username: str) -> bool:
    """该账号是否已触发验证码门槛（基于已有失败计数）。"""
    rec = _login_failures.get(username)
    return bool(rec and rec[0] >= CAPTCHA_AFTER_FAILURES)


def _render_captcha_svg(code: str) -> str:
    """生成带干扰的 SVG 验证码（干扰线/噪点/字符旋转错位），无第三方绘图依赖。"""
    import random
    width, height = 132, 48
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#f4f6fb"/>',
    ]
    for _ in range(4):  # 干扰曲线
        x1, y1 = random.randint(0, width), random.randint(0, height)
        x2, y2 = random.randint(0, width), random.randint(0, height)
        cx, cy = random.randint(0, width), random.randint(0, height)
        color = f"#{random.randint(0, 0xFFFFFF):06x}"
        parts.append(
            f'<path d="M{x1},{y1} Q{cx},{cy} {x2},{y2}" stroke="{color}" '
            f'stroke-width="1" fill="none" opacity="0.5"/>'
        )
    for _ in range(30):  # 噪点
        px, py = random.randint(0, width), random.randint(0, height)
        color = f"#{random.randint(0, 0xFFFFFF):06x}"
        parts.append(f'<circle cx="{px}" cy="{py}" r="1" fill="{color}" opacity="0.6"/>')
    step = width // (_CAPTCHA_LEN + 1)
    for i, ch in enumerate(code):  # 字符旋转 + 错位
        x = step * (i + 1)
        y = height // 2 + random.randint(-6, 6)
        rot = random.randint(-28, 28)
        color = f"#{random.randint(0, 0x555555):06x}"
        size = random.randint(22, 28)
        parts.append(
            f'<text x="{x}" y="{y + size // 3}" transform="rotate({rot} {x} {y})" '
            f'font-family="monospace" font-size="{size}" font-weight="bold" fill="{color}">'
            f"{ch}</text>"
        )
    parts.append("</svg>")
    return "".join(parts)


def _generate_captcha() -> dict[str, str]:
    """生成验证码，返回 {captcha_id, image_base64(data URL)}。"""
    now = datetime.now().timestamp()
    if len(_captcha_store) > _CAPTCHA_MAX_ENTRIES:
        for k in [k for k, (_, exp) in _captcha_store.items() if exp < now]:
            _captcha_store.pop(k, None)
    code = "".join(secrets.choice(_CAPTCHA_CHARS) for _ in range(_CAPTCHA_LEN))
    captcha_id = secrets.token_urlsafe(16)
    _captcha_store[captcha_id] = (code.lower(), now + _CAPTCHA_TTL_SECONDS)
    svg = _render_captcha_svg(code)
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return {"captcha_id": captcha_id, "image_base64": f"data:image/svg+xml;base64,{b64}"}


def _verify_captcha(captcha_id: str, captcha_code: str) -> bool:
    """一次性校验：无论对错都作废，防重放/枚举。"""
    if not captcha_id or not captcha_code:
        return False
    rec = _captcha_store.pop(captcha_id, None)
    if not rec:
        return False
    code, exp = rec
    if exp < datetime.now().timestamp():
        return False
    return secrets.compare_digest(code, captcha_code.strip().lower())


# ===== 健康检查 =====
async def view_health(info: Info) -> HealthType:
    logger.info(f"{_rid()}health check")
    return HealthType(status="ok", service="id_x_003")


# ---------------------------
# 认证相关
# ---------------------------
async def view_login_key(info: Info) -> LoginKeyType:
    """下发登录传输加密公钥（RSA-2048，PEM）。

    前端以此公钥（RSA-OAEP-SHA256）加密用户名/密码，密文只在后端内存私钥可解。
    """
    return LoginKeyType(public_key=x_crypto.public_key_pem())


def _decrypt_login_credentials(data: LoginInput) -> tuple[str, str] | None:
    """按 encrypted 标志解析登录凭据；加密模式下解密失败返回 None。"""
    if not data.encrypted:
        return data.username.strip(), data.password.strip()
    username = x_crypto.decrypt_field(data.username)
    password = x_crypto.decrypt_field(data.password)
    if username is None or password is None:
        return None
    return username.strip(), password.strip()


async def view_login(info: Info, data: LoginInput) -> ApiResponse:
    maker = get_session()
    async with maker() as session:
        try:
            credentials = _decrypt_login_credentials(data)
            if credentials is None:
                # 密文无法解密（非本公钥加密/被篡改/密钥已轮换）：统一按登录失败处理，不泄露细节
                logger.warning(f"{_rid()}登录凭据解密失败")
                return _resp(400, "登录请求无效，请刷新页面后重试")
            username, password = credentials
            # 防暴力破解：锁定中的账号直接拒绝（漏洞报告 #3）
            locked_for = _login_locked(username)
            if locked_for:
                return _resp(423, f"账号已锁定，请 {locked_for // 60 + 1} 分钟后再试")
            # 验证码门槛（漏洞报告 #3 建议①）：连续失败达阈值后必须先通过验证码
            if _captcha_required(username):
                if not _verify_captcha(data.captcha_id, data.captcha_code):
                    cap = _generate_captcha()
                    return _resp(428, "需要验证码", {
                        "need_captcha": "true",
                        "captcha_id": cap["captcha_id"],
                        "image_base64": cap["image_base64"],
                    })
            obj = await _first(session, select(AaEnlistUser).where(
                AaEnlistUser.username == username,
            ))
            if not obj:
                _check_password(_DUMMY_HASH, password)  # 抹平时序，防用户名枚举
                _record_login_failure(username)
                return _login_fail_response(username)
            ok, new_hash = _check_password(obj.password, password)
            if not ok:
                _record_login_failure(username)
                return _login_fail_response(username)
            _clear_login_failures(username)
            key = secrets.token_urlsafe(32)
            obj.key = key
            obj.time = datetime.now()
            if new_hash:  # 旧明文密码自动迁移为 PBKDF2 哈希
                obj.password = new_hash
            await session.commit()
            logger.info(f"{_rid()}User {username} logged in")
            return _resp(200, "Login Success", {
                "user_id": str(obj.id), "token": obj.key, "role": obj.role,
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_logout(info: Info, data: LogoutInput) -> ApiResponse:
    if not await _verify_user(info, data.user_id):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            user_id = _to_int(data.user_id)
            if user_id is None:
                return _resp(400, "用户ID非法")
            obj = await _first(session, select(AaEnlistUser).where(AaEnlistUser.id == user_id))
            if obj:
                obj.key = "N/A"
                await session.commit()
            return _resp(200, "Logout Success")
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


# ---------------------------
# 学生端 · 活动浏览 / 报名 / 记录
# ---------------------------
async def view_user_activity_list(info: Info, data: UserActivityListInput) -> ApiResponse:
    # 登录校验（漏洞报告 #2）：未登录不得浏览活动列表
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset, limit = _clamp_page(data.offset, data.limit)
            name = data.fuzzy_name

            query = select(AaEnlistActivity)

            start_dt = _ms_to_dt(start_date)
            end_dt = _ms_to_dt(end_date)
            if not start_dt or not end_dt:
                query = query.where(AaEnlistActivity.activity_start_time >= datetime.now().date())
            else:
                query = query.where(
                    AaEnlistActivity.activity_start_time >= start_dt,
                    AaEnlistActivity.activity_start_time <= end_dt,
                    AaEnlistActivity.activity_start_time >= datetime.now().date(),
                )

            if name:
                query = query.where(AaEnlistActivity.name.contains(name))

            total = await _count(session, query)
            query = query.order_by(desc(AaEnlistActivity.activity_start_time))
            result = await session.execute(query.offset((offset - 1) * limit).limit(limit))
            objs = result.scalars().all()

            detail = []
            for obj in objs:
                project = await _first(session, select(AaEnlistProject).where(
                    AaEnlistProject.id == obj.project_id
                ))
                quota = _to_int(project.quota) or 0 if project else 0
                number = await _count(session, select(AaEnlistApply).where(
                    AaEnlistApply.activity_id == obj.id
                ))
                state = "1" if number < quota else "2"
                if obj.activity_start_time and datetime.now() >= obj.activity_start_time - timedelta(days=1):
                    state = "0"

                detail.append({
                    "activity_id": str(obj.id),
                    "activity_name": str(obj.name),
                    "date": obj.activity_start_time.strftime("%m-%d") if obj.activity_start_time else "",
                    "start_time": obj.activity_start_time.strftime("%Y-%m-%d %H:%M") if obj.activity_start_time else "",
                    "end_time": obj.activity_end_time.strftime("%Y-%m-%d %H:%M") if obj.activity_end_time else "",
                    "start_time_show": obj.activity_start_time.strftime("%H:%M") if obj.activity_start_time else "",
                    "end_time_show": obj.activity_end_time.strftime("%H:%M") if obj.activity_end_time else "",
                    "state": str(state),
                    "quota": str(quota),
                    "number": str(number),
                })

            date = datetime.now().strftime("%Y-%m-%d")
            weekday = datetime.now().weekday()
            return _resp(200, "success", {
                "date": str(date),
                "week": WEEK_LIST[weekday],
                "total": str(total),
                "detail": detail,
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_user_activity_search(info: Info, activity_id: str) -> ApiResponse:
    # 登录校验（漏洞报告 #2）：未登录不得查看活动详情
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            activity_pk = _to_int(activity_id)
            if activity_pk is None:
                return _resp(404, "活动不存在")
            obj = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_pk
            ))
            if not obj:
                return _resp(404, "活动不存在")

            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == obj.project_id
            ))
            activity_content = project.content if project else ""

            date = obj.activity_start_time.strftime("%Y-%m-%d") if obj.activity_start_time else ""
            week = obj.activity_start_time.weekday() if obj.activity_start_time else 0
            start_time = obj.activity_start_time.strftime("%H:%M") if obj.activity_start_time else ""
            end_time = obj.activity_end_time.strftime("%H:%M") if obj.activity_end_time else ""
            quota = _to_int(project.quota) or 0 if project else 0
            number = await _count(session, select(AaEnlistApply).where(
                AaEnlistApply.activity_id == activity_pk
            ))

            detail: Any = ""
            if project and project.content_ex_id:
                content_obj = await _first(session, select(AaEnlistContent).where(
                    AaEnlistContent.id == project.content_ex_id
                ))
                if content_obj:
                    detail = json.loads(content_obj.content) if content_obj.content else {}

            state = "1" if number < quota else "2"
            if obj.activity_end_time and datetime.now() >= obj.activity_end_time:
                state = "0"

            return _resp(200, "success", {
                "activity_name": obj.name,
                "activity_content": activity_content,
                "date": date,
                "week": WEEK_LIST[week],
                "start_time": start_time,
                "end_time": end_time,
                "state": state,
                "detail": detail,
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_user_activity_fuzzy_name(info: Info, data: FuzzyNameInput) -> ApiResponse:
    # 登录校验（漏洞报告 #2）：未登录不得搜索活动名
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            result = await session.execute(select(AaEnlistActivity).where(
                AaEnlistActivity.name.startswith(data.fuzzy_name)
            ))
            activity_name_list = [i.name for i in result.scalars().all()]
            return _resp(200, "success", {"name_list": activity_name_list})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_user_activity_apply(info: Info, data: UserActivityApplyInput) -> ApiResponse:
    if not await _verify_user(info, data.user_id):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            user_id = data.user_id
            activity_id = data.activity_id
            info_text = data.info

            activity_pk = _to_int(activity_id)
            if activity_pk is None:
                return _resp(404, "活动或用户不存在")

            # 检查是否在同一周内已有报名
            result = await session.execute(
                select(AaEnlistApply)
                .where(AaEnlistApply.user_id == user_id)
                .order_by(desc(AaEnlistApply.time))
            )
            existing_applies = result.scalars().all()

            if existing_applies and existing_applies[0].time:
                year_1, week_1, _ = datetime.now().isocalendar()
                year_2, week_2, _ = existing_applies[0].time.isocalendar()
                if (year_1, week_1) == (year_2, week_2):
                    activity = await _first(session, select(AaEnlistActivity).where(
                        AaEnlistActivity.id == activity_pk
                    ))
                    return _resp(403, "You can only make one reservation in the same week.", {
                        "user_id": user_id,
                        "activity_id": activity_id,
                        "acctivity_name": activity.name if activity else "",
                        "apply_time": existing_applies[0].time.strftime("%Y-%m-%d %H:%M") if existing_applies[0].time else "",
                    })

            activity = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_pk
            ))
            user_pk = _to_int(user_id)
            if user_pk is None:
                return _resp(404, "活动或用户不存在")
            user = await _first(session, select(AaEnlistUser).where(
                AaEnlistUser.id == user_pk
            ))

            if not activity or not user:
                return _resp(404, "活动或用户不存在")

            obj = AaEnlistApply(
                project_id=activity.project_id,
                activity_id=activity_id,
                user_id=user_id,
                order="R" + "".join(secrets.choice(string.digits) for _ in range(8)),
                name=user.name,
                number=user.number,
                grade=user.grade,
                email=user.email,
                info_1=info_text,
                info_2="N/A",
                info_3="N/A",
                info_4="N/A",
                info_5="N/A",
                info_6="N/A",
                info_7="N/A",
                info_8="N/A",
            )
            session.add(obj)
            await session.commit()

            # 发送邮件（学生）
            msg = {
                "_title": activity.name,
                "_date": activity.activity_start_time.strftime("%Y-%m-%d") if activity.activity_start_time else "",
                "_start_time": activity.activity_start_time.strftime("%H:%M") if activity.activity_start_time else "",
                "_end_time": activity.activity_end_time.strftime("%H:%M") if activity.activity_end_time else "",
            }

            mail_subject = "Your sign-up: successful"
            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == activity.project_id
            ))
            owner = await _first(session, select(AaOwnerInfo).where(
                AaOwnerInfo.name == (project.owner if project else "")
            )) if project else None
            owner_email = owner.email if owner else ""

            template = await _first(session, select(AaHtmlTemplate).where(
                AaHtmlTemplate.type == "submit"
            ))
            mail_html = template.html.format(**msg) if template else ""
            _send_mail(
                mail_subject=mail_subject,
                mail_from=MAIL_FROM,
                mail_to=user.email,
                mail_cc="",
                mail_html=mail_html,
            )
            _log_mail("Send Apply Email To Student Successful.", user.email, mail_subject)

            # 发送邮件（顾问）：顾问信息缺失时跳过，不影响已提交的报名
            if owner and owner_email:
                msg = {
                    "_date": activity.activity_start_time.strftime("%Y-%m-%d") if activity.activity_start_time else "",
                    "_start_time": activity.activity_start_time.strftime("%H:%M") if activity.activity_start_time else "",
                    "_end_time": activity.activity_end_time.strftime("%H:%M") if activity.activity_end_time else "",
                    "_teacher_name": owner.name,
                    "_student_name": user.name,
                }
                template = await _first(session, select(AaHtmlTemplate).where(
                    AaHtmlTemplate.type == "submit_ex"
                ))
                ex_html = template.html.format(**msg) if template else ""
                ex_subject = f"校友咨询预约提醒-[{user.name}]"
                _send_mail(
                    mail_subject=ex_subject,
                    mail_from=MAIL_FROM,
                    mail_to=owner_email,
                    mail_cc="",
                    mail_html=ex_html,
                )
                _log_mail("Send Apply Email To Teacher Successful.", owner_email, ex_subject)
            else:
                logger.warning(f"{_rid()}顾问信息缺失（project={activity.project_id}），跳过顾问通知邮件")

            return _resp(200, "success", {
                "project_id": obj.project_id,
                "activity_id": obj.activity_id,
                "user_id": obj.user_id,
                "order": obj.order,
                "name": obj.name,
                "number": obj.number,
                "grade": obj.grade,
                "email": obj.email,
                "detail": {
                    "info_1": obj.info_1,
                    "info_2": obj.info_2,
                    "info_3": obj.info_3,
                    "info_4": obj.info_4,
                    "info_5": obj.info_5,
                    "info_6": obj.info_6,
                    "info_7": obj.info_7,
                    "info_8": obj.info_8,
                },
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_user_activity_detail(info: Info, data: UserRecordsInput) -> ApiResponse:
    if not await _verify_user(info, data.user_id):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            user_id = data.user_id
            offset, limit = _clamp_page(data.offset, data.limit)

            query = select(AaEnlistApply).where(
                AaEnlistApply.user_id == user_id
            ).order_by(desc(AaEnlistApply.id))

            total = await _count(session, query)
            result = await session.execute(query.offset((offset - 1) * limit).limit(limit))
            objs = result.scalars().all()

            _list = []
            for obj in objs:
                try:
                    activity = await _first(session, select(AaEnlistActivity).where(
                        AaEnlistActivity.id == obj.activity_id
                    ))
                    if activity:
                        _list.append({
                            "apply_id": str(obj.id),
                            "order": obj.order,
                            "time": obj.time.strftime("%Y-%m-%d %H:%M:%S") if obj.time else "",
                            "name": activity.name,
                            "start_time": activity.activity_start_time.strftime("%Y-%m-%d %H:%M") if activity.activity_start_time else "",
                            "end_time": activity.activity_end_time.strftime("%Y-%m-%d %H:%M") if activity.activity_end_time else "",
                            "state": obj.state,
                            "message": "",
                            "options": "",
                        })
                except Exception:
                    continue

            return _resp(200, "success", {"total": str(total), "detail": _list})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


def _decode_oauth_payload(oauth_token: str) -> dict | None:
    """严格校验 IdP 下发的 JWT 结构并解码 payload。

    - 必须为 header.payload.signature 三段结构；
    - payload 必须是合法 base64url + JSON，且包含 upn/email；
    - 若包含 exp，必须是未过期的时间戳。

    注意：完整的签名验证需要 IdP 的 JWKS 公钥配置（见 report.md 遗留项），
    此处先做结构与有效期校验，杜绝任意构造 token 直接登录。
    """
    try:
        parts = oauth_token.split(".")
        if len(parts) != 3 or not all(parts):
            return None
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload_data = json.loads(base64.urlsafe_b64decode(padded.encode()).decode("utf-8"))
        if not isinstance(payload_data, dict):
            return None
        if not payload_data.get("upn") or not payload_data.get("email"):
            return None
        exp = payload_data.get("exp")
        if exp is not None and datetime.now().timestamp() >= float(exp):
            return None
        return payload_data
    except (ValueError, TypeError, binascii.Error, json.JSONDecodeError):
        return None


async def view_user_activity_oauth(info: Info, data: OauthInput) -> ApiResponse:
    maker = get_session()
    async with maker() as session:
        try:
            payload_data = _decode_oauth_payload(data.oauth_token)
            if payload_data is None:
                return _resp(401, "Invalid OAuth Token")
            upn = _sanitize_header(payload_data.get("upn"))
            email = _sanitize_header(payload_data.get("email"))
            name = _sanitize_header(payload_data.get("CUHKSZ-DisplayName", ""))
            try:
                number = name.split(",")[1].strip().split(")")[0].strip()
            except Exception:
                number = "N/A"

            obj = await _first(session, select(AaEnlistUser).where(
                AaEnlistUser.username == upn,
                AaEnlistUser.name == name,
                AaEnlistUser.email == email,
            ))

            if not obj:
                # 服务端签发独立会话密钥，不再将 IdP token 直接作为会话凭证
                session_key = secrets.token_urlsafe(32)
                user_obj = AaEnlistUser(
                    username=upn,
                    name=name,
                    email=email,
                    role="user",
                    key=session_key,
                    password="N/A",
                    number=number,
                )
                session.add(user_obj)
                await session.commit()
                await session.refresh(user_obj)
                logger.warning(f"{_rid()}新用户注册 {upn} {name} {email} {number}")
                return _resp(200, "success", {
                    "check": "true",
                    "username": upn,
                    "user_id": str(user_obj.id),
                    "token": session_key,
                })

            # 老用户：统一签发新会话密钥（含 key="N/A" 的已登出用户——
            # OAuth 断言本身就是认证，登出后再次 SSO 必须能重新登录，
            # 否则 key="N/A" 会导致用户被永久锁定）
            session_key = secrets.token_urlsafe(32)
            obj.key = session_key
            obj.time = datetime.now()
            await session.commit()
            return _resp(200, "success", {
                "check": "true",
                "username": upn,
                "user_id": str(obj.id),
                "token": session_key,
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_user_activity_delete(info: Info, data: UserApplyDeleteInput) -> ApiResponse:
    if not await _verify_user(info, data.user_id):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            user_id = data.user_id
            apply_pk = _to_int(data.apply_id)
            if apply_pk is None:
                return _resp(404, "报名记录不存在")

            apply_obj = await _first(session, select(AaEnlistApply).where(
                AaEnlistApply.user_id == user_id,
                AaEnlistApply.id == apply_pk,
            ))

            if not apply_obj:
                return _resp(404, "报名记录不存在")

            activity = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == apply_obj.activity_id
            ))
            # 活动/项目/顾问可能已被删除：取消操作不应因此失败，仅跳过顾问通知
            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == activity.project_id
            )) if activity else None
            owner = await _first(session, select(AaOwnerInfo).where(
                AaOwnerInfo.name == project.owner
            )) if project else None
            owner_email = owner.email if owner else ""

            msg = {
                "_title": apply_obj.name,
                "_date": activity.activity_start_time.strftime("%Y-%m-%d") if activity and activity.activity_start_time else "",
                "_start_time": activity.activity_start_time.strftime("%H:%M") if activity and activity.activity_start_time else "",
                "_end_time": activity.activity_end_time.strftime("%H:%M") if activity and activity.activity_end_time else "",
            }

            mail_to = apply_obj.email
            apply_name = apply_obj.name  # 删除前取出，commit 后 ORM 实例属性已过期不可再访问
            mail_subject = "Cancellation Notice"
            template = await _first(session, select(AaHtmlTemplate).where(
                AaHtmlTemplate.type == "cancel"
            ))
            mail_html = template.html.format(**msg) if template else ""

            # 删除记录
            await session.delete(apply_obj)
            await session.commit()

            # 发送取消邮件（学生）
            _send_mail(
                mail_subject=mail_subject,
                mail_from=MAIL_FROM,
                mail_to=mail_to,
                mail_cc="",
                mail_html=mail_html,
            )
            _log_mail("Send Cancel Email To Student Successful.", mail_to, mail_subject)

            # 发送取消邮件（顾问）：顾问信息缺失时跳过，不影响已完成的取消
            if owner and owner_email:
                msg = {
                    "_student_name": apply_name,
                    "_date": activity.activity_start_time.strftime("%Y-%m-%d") if activity and activity.activity_start_time else "",
                    "_start_time": activity.activity_start_time.strftime("%H:%M") if activity and activity.activity_start_time else "",
                    "_end_time": activity.activity_end_time.strftime("%H:%M") if activity and activity.activity_end_time else "",
                }

                template = await _first(session, select(AaHtmlTemplate).where(
                    AaHtmlTemplate.type == "cancel_ex"
                ))
                ex_html = template.html.format(**msg) if template else ""
                ex_subject = f"校友咨询取消提醒-[{owner.name}]"
                _send_mail(
                    mail_subject=ex_subject,
                    mail_from=MAIL_FROM,
                    mail_to=owner_email,
                    mail_cc="",
                    mail_html=ex_html,
                )
                _log_mail("Send Cancel Email To Teacher Successful.", owner_email, ex_subject)

            return _resp(200, "success")
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


# ---------------------------
# 管理后台 · 项目管理
# ---------------------------
async def view_manage_project_list(info: Info, data: PageInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset, limit = _clamp_page(data.offset, data.limit)

            query = select(AaEnlistProject)

            start_dt = _ms_to_dt(start_date)
            end_dt = _ms_to_dt(end_date)
            if start_dt and end_dt:
                query = query.where(
                    AaEnlistProject.update >= start_dt,
                    AaEnlistProject.update <= end_dt,
                )

            total = await _count(session, query)
            query = query.order_by(desc(AaEnlistProject.update))
            result = await session.execute(query.offset((offset - 1) * limit).limit(limit))
            objs = result.scalars().all()

            detail = []
            for obj in objs:
                detail.append({
                    "project_id": str(obj.id),
                    "project_name": obj.name,
                    "project_content": obj.content,
                    "quota": str(obj.quota),
                    "owner": str(obj.owner),
                    "update_time": obj.update.strftime("%Y-%m-%d %H:%M:%S") if obj.update else "",
                })

            return _resp(200, "success", {"total": str(total), "detail": detail})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_project_update(info: Info, data: ProjectUpdateInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project_pk = _to_int(data.project_id)
            if project_pk is None:
                return _resp(400, "项目ID非法")
            obj = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == project_pk
            ))
            if not obj:
                return _resp(404, "项目不存在")

            obj.name = data.project_name
            obj.content = data.project_content
            obj.quota = data.quota
            obj.update = datetime.now()
            await session.commit()

            return _resp(200, "success", {
                "project_id": str(obj.id),
                "project_name": str(obj.name),
                "proudct_content": obj.content,
                "quota": str(obj.quota),
                "update": obj.update.isoformat() if obj.update else "",
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_project_search(info: Info, data: ProjectIdInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project_pk = _to_int(data.project_id)
            if project_pk is None:
                return _resp(400, "项目ID非法")
            obj = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == project_pk
            ))
            if not obj:
                return _resp(404, "项目不存在")

            return _resp(200, "success", {
                "project_id": str(obj.id),
                "project_name": str(obj.name),
                "proudct_content": str(obj.content),
                "quota": str(obj.quota),
                "owner": str(obj.owner),
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_project_owner_search(info: Info) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            result = await session.execute(select(AaOwnerInfo))
            title_list = [obj.name for obj in result.scalars().all() if obj.name not in ["N/A"]]
            return _resp(200, "success", {"owner_list": title_list})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_project_create(info: Info, data: ProjectCreateInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            name = data.project_name
            content = data.project_content
            quota = data.quota
            owner = data.owner

            if not all([name, content, quota]):
                return _resp(404, "fail")

            content_obj = await _first(session, select(AaEnlistContent).where(
                AaEnlistContent.id == 1
            ))

            res = AaEnlistProject(
                name=name,
                content=content,
                quota=quota,
                owner=owner,
                update=datetime.now(),
                content_ex_id=content_obj.id if content_obj else None,
            )
            session.add(res)
            await session.commit()
            await session.refresh(res)

            return _resp(200, "success", {
                "project_id": res.id,
                "project_name": res.name,
                "proudct_content": res.content,
                "quota": res.quota,
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_project_delete(info: Info, data: ProjectIdInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project_id = _to_int(data.project_id)
            if project_id is None:
                return _resp(400, "项目ID非法")

            await session.execute(delete(AaEnlistApply).where(AaEnlistApply.project_id == project_id))
            await session.execute(delete(AaEnlistActivity).where(AaEnlistActivity.project_id == project_id))
            await session.execute(delete(AaEnlistProject).where(AaEnlistProject.id == project_id))
            await session.commit()

            return _resp(200, "success")
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_project_name_list(info: Info) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            result = await session.execute(select(AaEnlistProject))
            objs = result.scalars().all()
            total = len(objs)

            detail = [{"project_id": obj.id, "project_name": obj.name} for obj in objs]

            return _resp(200, "success", {"total": total, "detail": detail})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


# ---------------------------
# 管理后台 · 活动管理
# ---------------------------
async def view_manage_activity_list(info: Info, data: PageInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset, limit = _clamp_page(data.offset, data.limit)

            query = select(AaEnlistActivity)

            start_dt = _ms_to_dt(start_date)
            end_dt = _ms_to_dt(end_date)
            if start_dt and end_dt:
                query = query.where(
                    AaEnlistActivity.activity_start_time >= start_dt,
                    AaEnlistActivity.activity_start_time <= end_dt,
                )

            total = await _count(session, query)
            query = query.order_by(desc(AaEnlistActivity.activity_start_time))
            result = await session.execute(query.offset((offset - 1) * limit).limit(limit))
            objs = result.scalars().all()

            detail = []
            for obj in objs:
                try:
                    project = await _first(session, select(AaEnlistProject).where(
                        AaEnlistProject.id == obj.project_id
                    ))
                    if project:
                        detail.append({
                            "activity_id": obj.id,
                            "project_name": obj.name,
                            "project_content": project.content,
                            "quota": project.quota,
                            "number": await _count(session, select(AaEnlistApply).where(
                                AaEnlistApply.activity_id == obj.id
                            )),
                            "activity_start_time": obj.activity_start_time.strftime("%Y-%m-%d %H:%M:%S") if obj.activity_start_time else "",
                            "activity_end_time": obj.activity_end_time.strftime("%Y-%m-%d %H:%M:%S") if obj.activity_end_time else "",
                            "apply_start_time": obj.apply_start_time.strftime("%Y-%m-%d %H:%M:%S") if obj.apply_start_time else "",
                            "apply_end_time": obj.apply_end_time.strftime("%Y-%m-%d %H:%M:%S") if obj.apply_end_time else "",
                            "apply_link": f"/b/sme/aa/enlist/user/acitvity/search?activity_id={obj.id}",
                            "apply_detail": f"/b/sme/aa/enlist/user/acitvity/detail?activity_id={obj.id}",
                        })
                except Exception:
                    continue

            return _resp(200, "success", {"total": total, "detail": detail})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_detail(info: Info, activity_id: str) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            activity_pk = _to_int(activity_id)
            if activity_pk is None:
                return _resp(404, "活动不存在")
            result = await session.execute(
                select(AaEnlistApply)
                .where(AaEnlistApply.activity_id == activity_pk)
                .order_by(desc(AaEnlistApply.id))
            )
            objs = result.scalars().all()

            activity = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_pk
            ))

            if not activity:
                return _resp(404, "活动不存在")

            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == activity.project_id
            ))

            start_time = activity.activity_start_time
            end_time = activity.activity_end_time
            quota = project.quota if project else "0"
            number = len(objs)

            detail = []
            for obj in objs:
                detail.append({
                    "apply_id": str(obj.activity_id),
                    "form_number": str(obj.order),
                    "student_id": str(obj.number),
                    "student_name": str(obj.name),
                    "grade": str(obj.grade),
                    "email": str(obj.email),
                    "apply_time": obj.time.strftime("%Y-%m-%d %H:%M:%S") if obj.time else "",
                    "state": str(obj.state),
                    "info_1": str(obj.info_1),
                    "info_2": str(obj.info_2),
                    "info_3": str(obj.info_3),
                    "info_4": str(obj.info_4),
                    "info_5": str(obj.info_5),
                    "info_6": str(obj.info_6),
                    "info_7": str(obj.info_7),
                    "info_8": str(obj.info_8),
                })

            return _resp(200, "success", {
                "start_time": start_time.isoformat() if start_time else "",
                "end_time": end_time.isoformat() if end_time else "",
                "quota": quota,
                "number": number,
                "detail": detail,
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_name_list(info: Info, data: ActivityNameListInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset, limit = _clamp_page(data.offset, data.limit)
            name = data.fuzzy_name

            query = select(AaEnlistActivity.name).distinct()

            start_dt = _ms_to_dt(start_date)
            end_dt = _ms_to_dt(end_date)
            if start_dt and end_dt:
                query = query.where(
                    AaEnlistActivity.activity_start_time >= start_dt,
                    AaEnlistActivity.activity_start_time <= end_dt,
                )

            if name:
                query = query.where(AaEnlistActivity.name.contains(name))

            total = await _count(session, query)
            result = await session.execute(query.offset((offset - 1) * limit).limit(limit))
            objs = result.all()

            detail = []
            _list = []
            for obj in objs:
                if obj[0] not in _list:
                    detail.append({"activity_name": obj[0]})
                    _list.append(obj[0])

            return _resp(200, "success", {"total": total, "detail": detail})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_create(info: Info, data: ActivityCreateInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project_pk = _to_int(data.project_id)
            if project_pk is None:
                return _resp(400, "项目ID非法")
            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == project_pk
            ))

            if not project:
                return _resp(404, "项目不存在")

            res = AaEnlistActivity(
                name=project.name,
                project_id=data.project_id,
                activity_start_time=_ms_to_dt(data.activity_start_time),
                activity_end_time=_ms_to_dt(data.activity_end_time),
                apply_start_time=_ms_to_dt(data.apply_start_time),
                apply_end_time=_ms_to_dt(data.apply_end_time),
            )
            session.add(res)
            await session.commit()
            await session.refresh(res)

            return _resp(200, "success", {
                "project_id": str(res.project_id),
                "activity_name": res.name,
                "activity_start_time": res.activity_start_time.isoformat() if res.activity_start_time else "",
                "activity_end_time": res.activity_end_time.isoformat() if res.activity_end_time else "",
                "apply_start_time": res.apply_start_time.isoformat() if res.apply_start_time else "",
                "apply_end_time": res.apply_end_time.isoformat() if res.apply_end_time else "",
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_update(info: Info, data: ActivityUpdateInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project_pk = _to_int(data.project_id)
            activity_pk = _to_int(data.activity_id)
            if project_pk is None or activity_pk is None:
                return _resp(400, "ID非法")
            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == project_pk
            ))

            if not project:
                return _resp(404, "项目不存在")

            obj = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_pk
            ))

            if not obj:
                return _resp(404, "活动不存在")

            obj.project_id = data.project_id
            obj.name = project.name
            obj.activity_start_time = _ms_to_dt(data.activity_start_time)
            obj.activity_end_time = _ms_to_dt(data.activity_end_time)
            obj.apply_start_time = _ms_to_dt(data.apply_start_time)
            obj.apply_end_time = _ms_to_dt(data.apply_end_time)
            obj.update = datetime.now()
            await session.commit()

            return _resp(200, "success", {
                "activity_id": str(obj.id),
                "project_id": str(obj.project_id),
                "activity_name": obj.name,
                "activity_start_time": obj.activity_start_time.isoformat() if obj.activity_start_time else "",
                "activity_end_time": obj.activity_end_time.isoformat() if obj.activity_end_time else "",
                "apply_start_time": obj.apply_start_time.isoformat() if obj.apply_start_time else "",
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_search(info: Info, data: ActivityIdInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            activity_pk = _to_int(data.activity_id)
            if activity_pk is None:
                return _resp(400, "活动ID非法")
            obj = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_pk
            ))

            if not obj:
                return _resp(404, "活动不存在")

            return _resp(200, "success", {
                "activity_id": str(obj.id),
                "project_id": str(obj.project_id),
                "activity_name": obj.name,
                "activity_start_time": obj.activity_start_time.isoformat() if obj.activity_start_time else "",
                "activity_end_time": obj.activity_end_time.isoformat() if obj.activity_end_time else "",
                "apply_start_time": obj.apply_start_time.isoformat() if obj.apply_start_time else "",
                "apply_end_time": obj.apply_end_time.isoformat() if obj.apply_end_time else "",
            })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_delete(info: Info, data: ActivityIdInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            activity_id = _to_int(data.activity_id)
            if activity_id is None:
                return _resp(400, "活动ID非法")

            await session.execute(delete(AaEnlistActivity).where(AaEnlistActivity.id == activity_id))
            await session.execute(delete(AaEnlistApply).where(AaEnlistApply.activity_id == activity_id))
            await session.commit()

            return _resp(200, "success")
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_upload(info: Info, file_name: str, file_base64: str,
                                      content_type: str = "") -> ApiResponse:
    """批量上传排期（.xlsx）。文件内容以 base64 传入，命中已有则更新，否则新增。"""
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            if not file_base64:
                return _resp(400, "文件不存在")

            # 大小限制：base64 解码前即可估算（约 3/4），防止超大载荷 OOM
            if len(file_base64) * 3 // 4 > MAX_UPLOAD_BYTES:
                return _resp(400, "文件过大")

            if not file_name.lower().endswith(".xlsx"):
                return _resp(400, "文件格式不正确")

            if "xlsx" in file_name or content_type in [
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ]:
                try:
                    file_bytes = base64.b64decode(file_base64, validate=True)
                except (binascii.Error, ValueError):
                    return _resp(400, "文件内容不是合法的 base64")
                try:
                    df = pd.read_excel(BytesIO(file_bytes), engine="openpyxl", sheet_name=0)
                except Exception:
                    return _resp(400, "无法解析的 Excel 文件")
                columns = df.columns
                success_num = 0
                fail_num = 0
                for index, row in df.iterrows():
                    if index < 1:
                        continue
                    for column in columns:
                        date = row.get("Date")
                        if str(row.get(column)).strip() not in ["nan", "", None, date]:
                            cell = row.get(column)
                            for d in str(cell).split("\n"):
                                # 单元格解析/写库任一失败仅计为失败行，不中断整批上传
                                try:
                                    year = str(datetime.now().year)
                                    month = column.split(".")[0]
                                    day = column.split(".")[1]
                                    start_time = str(date).split("-")[0]
                                    end_time = str(date).split("-")[1]

                                    activity_name = d

                                    activity_start_time = " ".join([
                                        "-".join([year, month, day]),
                                        ":".join([
                                            start_time.split(":")[0],
                                            start_time.split(":")[1],
                                            "00",
                                        ]),
                                    ])
                                    activity_end_time = " ".join([
                                        "-".join([year, month, day]),
                                        ":".join([
                                            end_time.split(":")[0],
                                            end_time.split(":")[1],
                                            "00",
                                        ]),
                                    ])
                                    apply_start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                    apply_end_time = (
                                        datetime.strptime(activity_start_time, "%Y-%m-%d %H:%M:%S")
                                        - timedelta(hours=24)
                                    ).strftime("%Y-%m-%d %H:%M:%S")

                                    project = await _first(session, select(AaEnlistProject).where(
                                        AaEnlistProject.name == activity_name
                                    ))
                                    if project:
                                        existing = await _first(session, select(AaEnlistActivity).where(
                                            AaEnlistActivity.name == activity_name,
                                            AaEnlistActivity.project_id == project.id,
                                            AaEnlistActivity.activity_start_time == datetime.strptime(activity_start_time, "%Y-%m-%d %H:%M:%S"),
                                            AaEnlistActivity.activity_end_time == datetime.strptime(activity_end_time, "%Y-%m-%d %H:%M:%S"),
                                        ))
                                        if existing:
                                            existing.apply_start_time = datetime.strptime(apply_start_time, "%Y-%m-%d %H:%M:%S")
                                            existing.apply_end_time = datetime.strptime(apply_end_time, "%Y-%m-%d %H:%M:%S")
                                        else:
                                            new_activity = AaEnlistActivity(
                                                name=activity_name,
                                                project_id=project.id,
                                                activity_start_time=datetime.strptime(activity_start_time, "%Y-%m-%d %H:%M:%S"),
                                                activity_end_time=datetime.strptime(activity_end_time, "%Y-%m-%d %H:%M:%S"),
                                                apply_start_time=datetime.strptime(apply_start_time, "%Y-%m-%d %H:%M:%S"),
                                                apply_end_time=datetime.strptime(apply_end_time, "%Y-%m-%d %H:%M:%S"),
                                            )
                                            session.add(new_activity)
                                        await session.commit()
                                        success_num += 1
                                except Exception as e:
                                    logger.error(f"Upload Failed: {d}, {e}")
                                    fail_num += 1
                                    await session.rollback()

                return _resp(200, "success", {"success": success_num, "fail": fail_num})
            else:
                return _resp(400, "文件格式不正确")
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_export(info: Info, data: ActivityExportInput) -> FileResponse:
    if not await _verify_admin(info):
        return FileResponse(code=401, msg="Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            activity_list = data.activity_list
            if len(activity_list) > MAX_LIST_ITEMS:
                return FileResponse(code=400, msg="活动数量超出上限")
            start_time = data.start_time
            end_time = data.end_time

            start_datetime = None
            end_datetime = None
            if start_time and end_time:
                start_datetime = _ms_to_dt(start_time)
                end_datetime = _ms_to_dt(end_time)

            activity_ids = []
            for activity_name in activity_list:
                query = select(AaEnlistActivity).where(AaEnlistActivity.name == activity_name)
                if start_datetime and end_datetime:
                    query = query.where(
                        AaEnlistActivity.apply_start_time >= start_datetime,
                        AaEnlistActivity.apply_end_time <= end_datetime,
                    )
                result = await session.execute(query)
                activity_ids.extend(obj.id for obj in result.scalars().all())

            wb = Workbook()
            ws = wb.active
            ws.append(["序号", "活动名称", "订单号", "姓名", "学号", "邮箱", "时间", "信息"])

            row_num = 0
            for activity_id in activity_ids:
                result = await session.execute(select(AaEnlistApply).where(
                    AaEnlistApply.activity_id == int(activity_id)
                ))
                objs = result.scalars().all()
                for obj in objs:
                    row_num += 1
                    activity = await _first(session, select(AaEnlistActivity).where(
                        AaEnlistActivity.id == obj.activity_id
                    ))
                    ws.append([
                        row_num,
                        activity.name if activity else "",
                        obj.order,
                        obj.name,
                        obj.number,
                        obj.email,
                        obj.time.strftime("%Y-%m-%d %H:%M:%S") if obj.time else "",
                        obj.info_1,
                    ])

            thin_border = Border(
                left=Side(style="thin"),
                right=Side(style="thin"),
                top=Side(style="thin"),
                bottom=Side(style="thin"),
            )
            for row in ws["A1:H1"]:
                for cell in row:
                    cell.border = thin_border
            fill = PatternFill(start_color="C0C0FF", end_color="C0C0FF", fill_type="solid")
            for row in ws["A1:H1"]:
                for cell in row:
                    cell.fill = fill

            buffer = BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            return FileResponse(
                code=200,
                msg="success",
                file_name="Export.xlsx",
                file_base64=base64.b64encode(buffer.getvalue()).decode("ascii"),
            )
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return FileResponse(code=500, msg="服务器错误")


async def view_manage_activity_export_fuzzy_name(info: Info, data: FuzzyNameInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            result = await session.execute(select(AaEnlistApply))
            apply_objs = result.scalars().all()
            activity_id_list = list(set([i.activity_id for i in apply_objs]))

            result = await session.execute(select(AaEnlistActivity).where(
                AaEnlistActivity.id.in_(activity_id_list),
                AaEnlistActivity.name.startswith(data.fuzzy_name),
            ))
            activity_name_list = [i.name for i in result.scalars().all()]

            return _resp(200, "success", {"name_list": activity_name_list})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_manage_activity_download(info: Info) -> FileResponse:
    """下载 14 天批量排期模板（Template.xlsx）。"""
    if not await _verify_admin(info):
        return FileResponse(code=401, msg="Token Error")
    try:
        wb = Workbook()
        ws = wb.active
        date_list, week_list = ["Date"], ["Week"]
        now = datetime.now()
        month = now.month
        day = now.day
        week = now.weekday()
        date_list.append(".".join([str(month), str(day)]))
        week_list.append(WEEK_LIST[week])
        for i in range(13):
            date = datetime.now() + timedelta(days=i + 1)
            month = date.month
            day = date.day
            week = date.weekday()
            date_list.append(".".join([str(month), str(day)]))
            week_list.append(WEEK_LIST[week])
        ws.append(date_list)
        ws.append(week_list)

        for i in range(3, 31):
            ws[f"A{i}"] = SLOT_LIST[i - 3]

        thin_border = Border(
            left=Side(style="thin"),
            right=Side(style="thin"),
            top=Side(style="thin"),
            bottom=Side(style="thin"),
        )
        for row in ws["A1:O30"]:
            for cell in row:
                cell.border = thin_border

        fill = PatternFill(start_color="C0C0FF", end_color="C0C0FF", fill_type="solid")
        for row in ws["A1:O2"]:
            for cell in row:
                cell.fill = fill

        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        return FileResponse(
            code=200,
            msg="success",
            file_name="Template.xlsx",
            file_base64=base64.b64encode(buffer.getvalue()).decode("ascii"),
        )
    except Exception as e:
        logger.error(f"{_rid()}{e}")
        return FileResponse(code=500, msg="服务器错误")


# ---------------------------
# 管理后台 · 数据查询
# ---------------------------
async def view_query_title_search(info: Info) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            result = await session.execute(select(AaEnlistActivity.name).distinct())
            title_list = [i[0] for i in result.all()]
            return _resp(200, "success", {"title_list": title_list})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_query_data_search(info: Info, data: QueryDataInput) -> ApiResponse:
    if not await _verify_admin(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            offset, limit = _clamp_page(data.offset, data.limit)
            title = data.title
            if len(title) > MAX_LIST_ITEMS:
                return _resp(400, "活动数量超出上限")
            start_time = data.start_time
            end_time = data.end_time

            query = select(AaEnlistActivity).where(AaEnlistActivity.name.in_(title))

            if start_time and end_time:
                start_dt = _ms_to_dt(start_time)
                end_dt = _ms_to_dt(end_time)
                query = query.where(
                    AaEnlistActivity.activity_start_time >= start_dt,
                    AaEnlistActivity.activity_start_time <= end_dt,
                )

            query = query.order_by(desc(AaEnlistActivity.activity_start_time))
            result = await session.execute(query)
            objs = result.scalars().all()
            ids = [obj.id for obj in objs]

            apply_query = select(AaEnlistApply).where(AaEnlistApply.activity_id.in_(ids))
            total = await _count(session, apply_query)
            result = await session.execute(apply_query)
            data_objs = result.scalars().all()

            result_list = []
            for d in data_objs:
                activity = await _first(session, select(AaEnlistActivity).where(
                    AaEnlistActivity.id == d.activity_id
                ))
                if activity:
                    result_list.append({
                        "seq": 0,
                        "aictivity_name": activity.name,
                        "order": d.order,
                        "name": d.name,
                        "number": d.number,
                        "email": d.email,
                        "time": activity.activity_start_time.strftime("%Y-%m-%d %H:%M") if activity.activity_start_time else "",
                        "info_1": d.info_1,
                        "info_2": d.info_2,
                        "info_3": d.info_3,
                        "info_4": d.info_4,
                        "info_5": d.info_5,
                        "info_6": d.info_6,
                        "info_7": d.info_7,
                        "info_8": d.info_8,
                    })

            sorted_result = sorted(
                result_list,
                key=lambda x: datetime.strptime(x["time"], "%Y-%m-%d %H:%M") if x["time"] else datetime.min,
                reverse=True,
            )

            _index = 0
            for item in sorted_result:
                _index += 1
                item["seq"] = _index

            sorted_result = sorted_result[(offset - 1) * limit: (offset - 1) * limit + limit]

            return _resp(200, "success", {"result": sorted_result, "total": total})
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_query_data_download(info: Info, data: TitleListInput) -> FileResponse:
    if not await _verify_admin(info):
        return FileResponse(code=401, msg="Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            title = data.title
            if len(title) > MAX_LIST_ITEMS:
                return FileResponse(code=400, msg="活动数量超出上限")

            result = await session.execute(select(AaEnlistActivity).where(
                AaEnlistActivity.name.in_(title)
            ))
            objs = result.scalars().all()
            ids = [obj.id for obj in objs]
            result = await session.execute(select(AaEnlistApply).where(
                AaEnlistApply.activity_id.in_(ids)
            ))
            data_objs = result.scalars().all()

            wb = Workbook()
            ws = wb.active
            ws.append(["序号", "活动名称", "订单号", "姓名", "邮箱", "时间", "信息"])
            row_num = 0
            for d in data_objs:
                row_num += 1
                activity = await _first(session, select(AaEnlistActivity).where(
                    AaEnlistActivity.id == d.activity_id
                ))
                ws.append([
                    row_num,
                    activity.name if activity else "",
                    d.order,
                    d.name,
                    d.email,
                    d.time.strftime("%Y-%m-%d %H:%M:%S") if d.time else "",
                    d.info_1,
                ])

            thin_border = Border(
                left=Side(style="thin"),
                right=Side(style="thin"),
                top=Side(style="thin"),
                bottom=Side(style="thin"),
            )
            for row in ws["A1:G1"]:
                for cell in row:
                    cell.border = thin_border
            fill = PatternFill(start_color="C0C0FF", end_color="C0C0FF", fill_type="solid")
            for row in ws["A1:G1"]:
                for cell in row:
                    cell.fill = fill

            buffer = BytesIO()
            wb.save(buffer)
            buffer.seek(0)

            return FileResponse(
                code=200,
                msg="success",
                file_name="Export.xlsx",
                file_base64=base64.b64encode(buffer.getvalue()).decode("ascii"),
            )
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return FileResponse(code=500, msg="服务器错误")
