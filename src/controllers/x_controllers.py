"""路由层：thin resolvers，只做参数透传，委托到 views。"""
from __future__ import annotations

import strawberry
from litestar import Router
from strawberry.extensions import DisableIntrospection, QueryDepthLimiter
from strawberry.litestar import make_graphql_controller
from strawberry.types import Info

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
from x_models.id_x_003.src.views import x_views


@strawberry.type
class Query:
    @strawberry.field(description="健康检查")
    async def health(self, info: Info) -> HealthType:
        return await x_views.view_health(info)

    @strawberry.field(description="登录传输加密公钥（RSA-2048 PEM，前端加密用户名/密码用）")
    async def login_key(self, info: Info) -> LoginKeyType:
        return await x_views.view_login_key(info)

    # ----- 学生端 · 活动浏览 -----
    @strawberry.field(description="学生端活动列表（分页，可按时间区间+活动名筛选）")
    async def user_activity_list(self, info: Info, data: UserActivityListInput) -> ApiResponse:
        return await x_views.view_user_activity_list(info, data)

    @strawberry.field(description="学生端活动详情")
    async def user_activity_search(self, info: Info, activity_id: int) -> ApiResponse:
        return await x_views.view_user_activity_search(info, activity_id)

    @strawberry.field(description="活动名前缀模糊搜索")
    async def user_activity_fuzzy_name(self, info: Info, data: FuzzyNameInput) -> ApiResponse:
        return await x_views.view_user_activity_fuzzy_name(info, data)

    @strawberry.field(description="我的报名记录（分页）")
    async def user_activity_detail(self, info: Info, data: UserRecordsInput) -> ApiResponse:
        return await x_views.view_user_activity_detail(info, data)

    # ----- 管理后台 · 项目 -----
    @strawberry.field(description="项目列表（分页）")
    async def manage_project_list(self, info: Info, data: PageInput) -> ApiResponse:
        return await x_views.view_manage_project_list(info, data)

    @strawberry.field(description="项目详情")
    async def manage_project_search(self, info: Info, data: ProjectIdInput) -> ApiResponse:
        return await x_views.view_manage_project_search(info, data)

    @strawberry.field(description="顾问列表")
    async def manage_project_owner_search(self, info: Info) -> ApiResponse:
        return await x_views.view_manage_project_owner_search(info)

    @strawberry.field(description="项目名称列表")
    async def manage_project_name_list(self, info: Info) -> ApiResponse:
        return await x_views.view_manage_project_name_list(info)

    # ----- 管理后台 · 活动 -----
    @strawberry.field(description="活动列表（分页）")
    async def manage_activity_list(self, info: Info, data: PageInput) -> ApiResponse:
        return await x_views.view_manage_activity_list(info, data)

    @strawberry.field(description="活动报名明细")
    async def manage_activity_detail(self, info: Info, activity_id: int) -> ApiResponse:
        return await x_views.view_manage_activity_detail(info, activity_id)

    @strawberry.field(description="活动名称列表（去重，分页）")
    async def manage_activity_name_list(self, info: Info, data: ActivityNameListInput) -> ApiResponse:
        return await x_views.view_manage_activity_name_list(info, data)

    @strawberry.field(description="活动详情")
    async def manage_activity_search(self, info: Info, data: ActivityIdInput) -> ApiResponse:
        return await x_views.view_manage_activity_search(info, data)

    @strawberry.field(description="导出报名数据（Excel，base64）")
    async def manage_activity_export(self, info: Info, data: ActivityExportInput) -> FileResponse:
        return await x_views.view_manage_activity_export(info, data)

    @strawberry.field(description="导出页活动名前缀模糊搜索")
    async def manage_activity_export_fuzzy_name(self, info: Info, data: FuzzyNameInput) -> ApiResponse:
        return await x_views.view_manage_activity_export_fuzzy_name(info, data)

    @strawberry.field(description="下载 14 天批量排期模板（Excel，base64）")
    async def manage_activity_download(self, info: Info) -> FileResponse:
        return await x_views.view_manage_activity_download(info)

    # ----- 管理后台 · 数据查询 -----
    @strawberry.field(description="全部活动标题列表")
    async def query_title_search(self, info: Info) -> ApiResponse:
        return await x_views.view_query_title_search(info)

    @strawberry.field(description="按活动名+时间区间查询报名数据（分页）")
    async def query_data_search(self, info: Info, data: QueryDataInput) -> ApiResponse:
        return await x_views.view_query_data_search(info, data)

    @strawberry.field(description="按活动名下载报名数据（Excel，base64）")
    async def query_data_download(self, info: Info, data: TitleListInput) -> FileResponse:
        return await x_views.view_query_data_download(info, data)


@strawberry.type
class Mutation:
    # ----- 认证 -----
    @strawberry.mutation(description="管理员账号密码登录")
    async def login(self, info: Info, data: LoginInput) -> ApiResponse:
        return await x_views.view_login(info, data)

    @strawberry.mutation(description="登出")
    async def logout(self, info: Info, data: LogoutInput) -> ApiResponse:
        return await x_views.view_logout(info, data)

    @strawberry.mutation(description="学生 SSO 登录（首次自动建档）")
    async def user_activity_oauth(self, info: Info, data: OauthInput) -> ApiResponse:
        return await x_views.view_user_activity_oauth(info, data)

    # ----- 学生端 · 报名 -----
    @strawberry.mutation(description="学生提交报名（同周唯一校验 + 邮件通知）")
    async def user_activity_apply(self, info: Info, data: UserActivityApplyInput) -> ApiResponse:
        return await x_views.view_user_activity_apply(info, data)

    @strawberry.mutation(description="学生取消报名（删除记录 + 邮件通知）")
    async def user_activity_delete(self, info: Info, data: UserApplyDeleteInput) -> ApiResponse:
        return await x_views.view_user_activity_delete(info, data)

    # ----- 管理后台 · 项目 -----
    @strawberry.mutation(description="创建项目")
    async def manage_project_create(self, info: Info, data: ProjectCreateInput) -> ApiResponse:
        return await x_views.view_manage_project_create(info, data)

    @strawberry.mutation(description="更新项目")
    async def manage_project_update(self, info: Info, data: ProjectUpdateInput) -> ApiResponse:
        return await x_views.view_manage_project_update(info, data)

    @strawberry.mutation(description="删除项目（级联删除活动与报名）")
    async def manage_project_delete(self, info: Info, data: ProjectIdInput) -> ApiResponse:
        return await x_views.view_manage_project_delete(info, data)

    # ----- 管理后台 · 活动 -----
    @strawberry.mutation(description="创建活动")
    async def manage_activity_create(self, info: Info, data: ActivityCreateInput) -> ApiResponse:
        return await x_views.view_manage_activity_create(info, data)

    @strawberry.mutation(description="更新活动")
    async def manage_activity_update(self, info: Info, data: ActivityUpdateInput) -> ApiResponse:
        return await x_views.view_manage_activity_update(info, data)

    @strawberry.mutation(description="删除活动（级联删除报名）")
    async def manage_activity_delete(self, info: Info, data: ActivityIdInput) -> ApiResponse:
        return await x_views.view_manage_activity_delete(info, data)

    @strawberry.mutation(description="批量上传排期（.xlsx，base64 传入）")
    async def manage_activity_upload(
        self,
        info: Info,
        file_name: str,
        file_base64: str,
        content_type: str = "",
    ) -> ApiResponse:
        return await x_views.view_manage_activity_upload(info, file_name, file_base64, content_type)


# 安全加固（漏洞报告 #1）：
# - DisableIntrospection：关闭 introspection，防止攻击者获取完整 schema
# - QueryDepthLimiter：限制查询深度，防止深层嵌套查询造成 DoS
schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    extensions=[
        DisableIntrospection(),
        QueryDepthLimiter(max_depth=8),
    ],
)



def register_routers(route_prefix: str) -> Router:
    # 安全加固（漏洞报告 #1 补充）：
    # - graphql_ide=None：禁止对外暴露 GraphiQL 交互式 IDE，避免泄露 schema 线索
    # - allow_queries_via_get=False：仅接受 POST 查询，杜绝 GET/URL 直达与缓存投毒
    controller = make_graphql_controller(
        schema,
        path="/graphql",
        graphql_ide=None,
        allow_queries_via_get=False,
    )
    return Router(path=route_prefix, route_handlers=[controller])
