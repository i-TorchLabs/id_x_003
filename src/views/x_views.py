"""业务层：全部业务逻辑，view_* 命名；异常在视图内捕获并转换为业务响应。

重构自 sme_cdc_enlist_aa（Quart/REST）：
- 保持原有业务规则与响应数据结构（code/msg/data）不变；
- 同步 SQLAlchemy 查询迁移为 async SQLAlchemy 2.0（select/delete）；
- Token 从 GraphQL 请求头 Header "Token" 读取；
- 文件下载以 base64 返回（原 send_file）。
"""
from __future__ import annotations

import base64
import json
import random
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

# ===== 常量（与原系统一致） =====
WEEK_LIST = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

MAIL_SERVER = "mail.cuhk.edu.cn"
MAIL_PORT = 587
MAIL_USER = "careersme@cuhk.edu.cn"
MAIL_FROM = "careersme@cuhk.edu.cn"
MAIL_PASSWORD = "n04n8#X4O48@4Gh0oqw93"

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


async def _verify_token(info: Info) -> bool:
    """Token 验证：请求头 Token 需匹配用户表 key 字段。"""
    token = _get_token(info)
    if not token:
        return False
    try:
        maker = get_session()
        async with maker() as session:
            result = await session.execute(select(AaEnlistUser).where(AaEnlistUser.key == token))
            return result.scalars().first() is not None
    except Exception as e:
        logger.error(f"{_rid()}Token验证失败: {e}")
        return False


def _send_mail(*, mail_subject: str = "", mail_from: str = "", mail_to: str = "",
               mail_cc: str = "", mail_html: str = "") -> bool:
    """发送邮件（与原系统一致：SMTP + STARTTLS）。"""
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


# ===== 健康检查 =====
async def view_health(info: Info) -> HealthType:
    logger.info(f"{_rid()}health check")
    return HealthType(status="ok", service="id_x_003")


# ---------------------------
# 认证相关
# ---------------------------
async def view_login(info: Info, data: LoginInput) -> ApiResponse:
    maker = get_session()
    async with maker() as session:
        try:
            username = data.username.strip()
            password = data.password.strip()
            obj = await _first(session, select(AaEnlistUser).where(
                AaEnlistUser.username == username,
                AaEnlistUser.password == password,
            ))
            if not obj:
                return _resp(401, "Login Fail")
            key = secrets.token_urlsafe(32)
            obj.key = key
            obj.time = datetime.now()
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            user_id = data.user_id.strip()
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
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset = int(data.offset)
            limit = int(data.limit)
            name = data.fuzzy_name

            query = select(AaEnlistActivity)

            if not start_date or not end_date:
                query = query.where(AaEnlistActivity.activity_start_time >= datetime.now().date())
            else:
                start_dt = datetime.fromtimestamp(int(start_date) / 1000)
                end_dt = datetime.fromtimestamp(int(end_date) / 1000)
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
                quota = int(project.quota) if project and project.quota else 0
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
    maker = get_session()
    async with maker() as session:
        try:
            obj = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_id
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
            quota = int(project.quota) if project and project.quota else 0
            number = await _count(session, select(AaEnlistApply).where(
                AaEnlistApply.activity_id == activity_id
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
    maker = get_session()
    async with maker() as session:
        try:
            user_id = data.user_id
            activity_id = data.activity_id
            info_text = data.info

            # 检查是否在同一周内已有报名
            result = await session.execute(
                select(AaEnlistApply)
                .where(AaEnlistApply.user_id == user_id)
                .order_by(desc(AaEnlistApply.time))
            )
            existing_applies = result.scalars().all()

            if existing_applies:
                year_1, week_1, _ = datetime.now().isocalendar()
                year_2, week_2, _ = existing_applies[0].time.isocalendar()
                if (year_1, week_1) == (year_2, week_2):
                    activity = await _first(session, select(AaEnlistActivity).where(
                        AaEnlistActivity.id == activity_id
                    ))
                    return _resp(403, "You can only make one reservation in the same week.", {
                        "user_id": user_id,
                        "activity_id": activity_id,
                        "acctivity_name": activity.name if activity else "",
                        "apply_time": existing_applies[0].time.strftime("%Y-%m-%d %H:%M") if existing_applies[0].time else "",
                    })

            activity = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_id
            ))
            user = await _first(session, select(AaEnlistUser).where(
                AaEnlistUser.id == user_id
            ))

            if not activity or not user:
                return _resp(404, "活动或用户不存在")

            obj = AaEnlistApply(
                project_id=activity.project_id,
                activity_id=activity_id,
                user_id=user_id,
                order="R" + "".join(random.sample(string.digits, 8)),
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
                AaOwnerInfo.name == project.owner
            ))
            owner_email = owner.email

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

            # 发送邮件（顾问）
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
    maker = get_session()
    async with maker() as session:
        try:
            user_id = data.user_id
            offset = int(data.offset)
            limit = int(data.limit)

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


async def view_user_activity_oauth(info: Info, data: OauthInput) -> ApiResponse:
    maker = get_session()
    async with maker() as session:
        try:
            payload = data.oauth_token.split(".")[1]
            payload_decoded = base64.b64decode(payload + "===").decode("utf-8")
            payload_data = json.loads(payload_decoded)
            upn = payload_data.get("upn")
            email = payload_data.get("email")
            name = payload_data.get("CUHKSZ-DisplayName")
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
                user_obj = AaEnlistUser(
                    username=upn,
                    name=name,
                    email=email,
                    role="user",
                    key=data.oauth_token,
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
                    "token": data.oauth_token,
                })

            if obj.key in ["N/A"]:
                logger.warning(f"{_rid()}用户 {upn} {name} {email} {number} 尝试使用 OAuth 登录，但未绑定密钥")
                obj.time = datetime.now()
                await session.commit()
                return _resp(200, "success", {
                    "check": "false",
                    "username": upn,
                    "user_id": str(obj.id),
                    "token": data.oauth_token,
                })
            else:
                obj.time = datetime.now()
                await session.commit()
                return _resp(200, "success", {
                    "check": "true",
                    "username": upn,
                    "user_id": str(obj.id),
                    "token": data.oauth_token,
                })
        except Exception as e:
            logger.error(f"{_rid()}{e}")
            await session.rollback()
            return _resp(500, "服务器错误")


async def view_user_activity_delete(info: Info, data: UserApplyDeleteInput) -> ApiResponse:
    maker = get_session()
    async with maker() as session:
        try:
            user_id = data.user_id
            apply_id = data.apply_id

            apply_obj = await _first(session, select(AaEnlistApply).where(
                AaEnlistApply.user_id == user_id,
                AaEnlistApply.id == apply_id,
            ))

            if not apply_obj:
                return _resp(404, "报名记录不存在")

            activity = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == apply_obj.activity_id
            ))
            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == activity.project_id
            ))
            owner = await _first(session, select(AaOwnerInfo).where(
                AaOwnerInfo.name == project.owner
            ))
            owner_email = owner.email

            msg = {
                "_title": apply_obj.name,
                "_date": activity.activity_start_time.strftime("%Y-%m-%d") if activity and activity.activity_start_time else "",
                "_start_time": activity.activity_start_time.strftime("%H:%M") if activity and activity.activity_start_time else "",
                "_end_time": activity.activity_end_time.strftime("%H:%M") if activity and activity.activity_end_time else "",
            }

            mail_to = apply_obj.email
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

            # 发送取消邮件（顾问）
            msg = {
                "_student_name": apply_obj.name,
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset = int(data.offset)
            limit = int(data.limit)

            query = select(AaEnlistProject)

            if start_date and end_date:
                start_dt = datetime.fromtimestamp(int(start_date) / 1000)
                end_dt = datetime.fromtimestamp(int(end_date) / 1000)
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            obj = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == int(data.project_id)
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            obj = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == data.project_id
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
    if not await _verify_token(info):
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project_id = int(data.project_id)

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
    if not await _verify_token(info):
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset = int(data.offset)
            limit = int(data.limit)

            query = select(AaEnlistActivity)

            if start_date and end_date:
                start_dt = datetime.fromtimestamp(int(start_date) / 1000)
                end_dt = datetime.fromtimestamp(int(end_date) / 1000)
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            result = await session.execute(
                select(AaEnlistApply)
                .where(AaEnlistApply.activity_id == activity_id)
                .order_by(desc(AaEnlistApply.id))
            )
            objs = result.scalars().all()

            activity = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == activity_id
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            start_date = data.start_date
            end_date = data.end_date
            offset = int(data.offset)
            limit = int(data.limit)
            name = data.fuzzy_name

            query = select(AaEnlistActivity.name).distinct()

            if start_date and end_date:
                start_dt = datetime.fromtimestamp(int(start_date) / 1000)
                end_dt = datetime.fromtimestamp(int(end_date) / 1000)
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == int(data.project_id)
            ))

            if not project:
                return _resp(404, "项目不存在")

            res = AaEnlistActivity(
                name=project.name,
                project_id=data.project_id,
                activity_start_time=datetime.fromtimestamp(int(data.activity_start_time) / 1000) if data.activity_start_time else None,
                activity_end_time=datetime.fromtimestamp(int(data.activity_end_time) / 1000) if data.activity_end_time else None,
                apply_start_time=datetime.fromtimestamp(int(data.apply_start_time) / 1000) if data.apply_start_time else None,
                apply_end_time=datetime.fromtimestamp(int(data.apply_end_time) / 1000) if data.apply_end_time else None,
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            project = await _first(session, select(AaEnlistProject).where(
                AaEnlistProject.id == int(data.project_id)
            ))

            if not project:
                return _resp(404, "项目不存在")

            obj = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == int(data.activity_id)
            ))

            if not obj:
                return _resp(404, "活动不存在")

            obj.project_id = data.project_id
            obj.name = project.name
            obj.activity_start_time = datetime.fromtimestamp(int(data.activity_start_time) / 1000) if data.activity_start_time else None
            obj.activity_end_time = datetime.fromtimestamp(int(data.activity_end_time) / 1000) if data.activity_end_time else None
            obj.apply_start_time = datetime.fromtimestamp(int(data.apply_start_time) / 1000) if data.apply_start_time else None
            obj.apply_end_time = datetime.fromtimestamp(int(data.apply_end_time) / 1000) if data.apply_end_time else None
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            obj = await _first(session, select(AaEnlistActivity).where(
                AaEnlistActivity.id == int(data.activity_id)
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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            activity_id = int(data.activity_id)

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
    if not await _verify_token(info):
        return _resp(401, "Token Error")
    maker = get_session()
    async with maker() as session:
        try:
            if not file_base64:
                return _resp(400, "文件不存在")

            if "xlsx" in file_name or content_type in [
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ]:
                df = pd.read_excel(BytesIO(base64.b64decode(file_base64)), engine="openpyxl", sheet_name=0)
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
                                year = str(datetime.now().year)
                                month = column.split(".")[0]
                                day = column.split(".")[1]
                                start_time = date.split("-")[0]
                                end_time = date.split("-")[1]

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

                                try:
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
                                    logger.error(f"Upload Failed: {activity_name}, {e}")
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
    maker = get_session()
    async with maker() as session:
        try:
            activity_list = data.activity_list
            start_time = data.start_time
            end_time = data.end_time

            start_datetime = None
            end_datetime = None
            if start_time and end_time:
                try:
                    start_datetime = datetime.fromtimestamp(int(start_time) / 1000)
                    end_datetime = datetime.fromtimestamp(int(end_time) / 1000)
                except (ValueError, TypeError, OSError):
                    start_datetime = None
                    end_datetime = None

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
    maker = get_session()
    async with maker() as session:
        try:
            limit = int(data.limit)
            offset = int(data.offset)
            title = data.title
            start_time = data.start_time
            end_time = data.end_time

            query = select(AaEnlistActivity).where(AaEnlistActivity.name.in_(title))

            if start_time and end_time:
                start_dt = datetime.fromtimestamp(start_time / 1000)
                end_dt = datetime.fromtimestamp(end_time / 1000)
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
    maker = get_session()
    async with maker() as session:
        try:
            title = data.title

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
