"""契约层：Strawberry GraphQL Input/Type 纯类型定义，不含任何业务逻辑。"""
from __future__ import annotations

from typing import List, Optional

import strawberry
from strawberry.scalars import JSON


# ===== 通用 =====
@strawberry.type
class HealthType:
    status: str = strawberry.field(description="服务状态")
    service: str = strawberry.field(description="服务名")


@strawberry.type
class ApiResponse:
    """统一业务响应：code/msg/data，data 为 JSON 载荷（与原 REST 响应结构一致）。"""
    code: int = strawberry.field(description="状态码")
    msg: str = strawberry.field(description="消息")
    data: JSON = strawberry.field(default_factory=dict, description="业务数据")


@strawberry.type
class FileResponse:
    """文件下载响应：以 base64 承载文件内容。"""
    code: int = strawberry.field(description="状态码")
    msg: str = strawberry.field(description="消息")
    file_name: str = strawberry.field(default="", description="文件名")
    file_base64: str = strawberry.field(default="", description="文件内容（base64）")


# ===== 认证 =====
@strawberry.type
class LoginKeyType:
    """登录传输加密公钥：前端用其 RSA-OAEP(SHA-256) 加密用户名/密码后再提交。"""
    public_key: str = strawberry.field(description="RSA-2048 公钥（PEM）")
    algorithm: str = strawberry.field(default="RSA-OAEP-SHA256", description="加密算法标识")


@strawberry.input
class LoginInput:
    username: str = strawberry.field(description="用户名（encrypted=true 时为 RSA 密文 base64）")
    password: str = strawberry.field(description="密码（encrypted=true 时为 RSA 密文 base64）")
    encrypted: bool = strawberry.field(default=False, description="用户名/密码是否经 loginKey 公钥加密")
    captcha_id: str = strawberry.field(default="", description="验证码ID（触发验证码后必填）")
    captcha_code: str = strawberry.field(default="", description="验证码答案（触发验证码后必填）")


@strawberry.input
class LogoutInput:
    user_id: int = strawberry.field(description="用户ID")


@strawberry.input
class OauthInput:
    """学生 SSO 登录入参：ADFS 授权码授予流。

    - 优先使用 code（授权码，服务端用 client_secret 换 id_token，最安全）；
    - state 用于 CSRF 校验，由前端生成并在回调时原样回传；
    - oauth_token 仅为旧隐式流兼容保留，新流程不应使用。
    """
    code: str = strawberry.field(default="", description="ADFS 授权码（response_type=code 回调获得）")
    state: str = strawberry.field(default="", description="CSRF 防护随机串（与授权请求一致）")
    oauth_token: str = strawberry.field(default="", description="[已废弃] 旧隐式流 access_token")


# ===== 学生端 =====
@strawberry.input
class UserActivityListInput:
    start_date: Optional[str] = strawberry.field(default=None, description="开始时间（毫秒时间戳）")
    end_date: Optional[str] = strawberry.field(default=None, description="结束时间（毫秒时间戳）")
    offset: int = strawberry.field(default=1, description="页码")
    limit: int = strawberry.field(default=10, description="每页数量")
    fuzzy_name: str = strawberry.field(default="", description="活动名模糊匹配")


@strawberry.input
class UserActivityApplyInput:
    user_id: int = strawberry.field(description="用户ID")
    activity_id: int = strawberry.field(description="活动ID")
    info: str = strawberry.field(default="", description="咨询话题（info_1）")


@strawberry.input
class UserRecordsInput:
    user_id: int = strawberry.field(description="用户ID")
    offset: int = strawberry.field(default=1, description="页码")
    limit: int = strawberry.field(default=30, description="每页数量")


@strawberry.input
class UserApplyDeleteInput:
    user_id: int = strawberry.field(description="用户ID")
    apply_id: int = strawberry.field(description="报名ID")


@strawberry.input
class FuzzyNameInput:
    fuzzy_name: str = strawberry.field(default="", description="名称前缀模糊匹配")


# ===== 管理后台 · 项目 =====
@strawberry.input
class PageInput:
    start_date: Optional[str] = strawberry.field(default=None, description="开始时间（毫秒时间戳）")
    end_date: Optional[str] = strawberry.field(default=None, description="结束时间（毫秒时间戳）")
    offset: int = strawberry.field(default=1, description="页码")
    limit: int = strawberry.field(default=10, description="每页数量")


@strawberry.input
class ProjectUpdateInput:
    project_id: int = strawberry.field(description="项目ID")
    project_name: str = strawberry.field(description="项目名称")
    project_content: str = strawberry.field(description="项目内容")
    quota: str = strawberry.field(description="名额")


@strawberry.input
class ProjectIdInput:
    project_id: int = strawberry.field(description="项目ID")


@strawberry.input
class ProjectCreateInput:
    project_name: str = strawberry.field(default="N/A", description="项目名称")
    project_content: str = strawberry.field(default="N/A", description="项目内容")
    quota: str = strawberry.field(default="N/A", description="名额")
    owner: str = strawberry.field(default="N/A", description="所属顾问")


# ===== 管理后台 · 活动 =====
@strawberry.input
class ActivityNameListInput:
    start_date: Optional[str] = strawberry.field(default=None, description="开始时间（毫秒时间戳）")
    end_date: Optional[str] = strawberry.field(default=None, description="结束时间（毫秒时间戳）")
    offset: int = strawberry.field(default=1, description="页码")
    limit: int = strawberry.field(default=10, description="每页数量")
    fuzzy_name: str = strawberry.field(default="", description="活动名模糊匹配")


@strawberry.input
class ActivityCreateInput:
    project_id: int = strawberry.field(description="项目ID")
    activity_name: Optional[str] = strawberry.field(default=None, description="活动名称")
    activity_start_time: Optional[str] = strawberry.field(default=None, description="活动开始（毫秒时间戳）")
    activity_end_time: Optional[str] = strawberry.field(default=None, description="活动结束（毫秒时间戳）")
    apply_start_time: Optional[str] = strawberry.field(default=None, description="报名开始（毫秒时间戳）")
    apply_end_time: Optional[str] = strawberry.field(default=None, description="报名结束（毫秒时间戳）")


@strawberry.input
class ActivityUpdateInput:
    activity_id: int = strawberry.field(description="活动ID")
    project_id: int = strawberry.field(description="项目ID")
    activity_start_time: Optional[str] = strawberry.field(default=None, description="活动开始（毫秒时间戳）")
    activity_end_time: Optional[str] = strawberry.field(default=None, description="活动结束（毫秒时间戳）")
    apply_start_time: Optional[str] = strawberry.field(default=None, description="报名开始（毫秒时间戳）")
    apply_end_time: Optional[str] = strawberry.field(default=None, description="报名结束（毫秒时间戳）")


@strawberry.input
class ActivityIdInput:
    activity_id: int = strawberry.field(description="活动ID")


@strawberry.input
class ActivityExportInput:
    activity_list: List[str] = strawberry.field(description="活动名称列表")
    start_time: Optional[str] = strawberry.field(default=None, description="开始时间（毫秒时间戳）")
    end_time: Optional[str] = strawberry.field(default=None, description="结束时间（毫秒时间戳）")


# ===== 管理后台 · 数据查询 =====
@strawberry.input
class QueryDataInput:
    title: List[str] = strawberry.field(default_factory=list, description="活动名称列表")
    start_time: Optional[str] = strawberry.field(default=None, description="开始时间（毫秒时间戳）")
    end_time: Optional[str] = strawberry.field(default=None, description="结束时间（毫秒时间戳）")
    offset: int = strawberry.field(default=1, description="页码")
    limit: int = strawberry.field(default=10, description="每页数量")


@strawberry.input
class TitleListInput:
    title: List[str] = strawberry.field(description="活动名称列表")
