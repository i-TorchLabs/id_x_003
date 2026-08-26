import dayjs from "dayjs";
import { callApi, callFileApi, type FileResponse } from "./graphql";

/**
 * 管理端 GraphQL API（对应后端 src/controllers/x_controllers.py 的 Query/Mutation）
 * 说明:
 * - 字段名遵循 Strawberry 默认 camelCase 规则
 * - 列表分页 offset 为页码(从 1 开始)、limit 为每页数量,均为整型
 * - 时间筛选参数为毫秒时间戳字符串;'yyyy-MM-dd HH:mm'/'yyyy-MM-ddTHH:mm' 在此统一转换
 */

/** 'yyyy-MM-dd HH:mm' / 'yyyy-MM-ddTHH:mm' -> 毫秒时间戳字符串;空值 -> null */
const toMs = (v?: string | null): string | null => {
  if (!v) return null;
  return String(dayjs(String(v).replace("T", " ")).valueOf());
};

/** 毫秒时间戳/字符串 -> 毫秒时间戳字符串;空值 -> null */
const tsToMs = (v?: string | number | null): string | null => {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
};

const toPage = (v?: string | number): number => Number(v ?? 1);

export interface AdminProjectListReq {
  /**
   * 结束日期
   */
  end_date?: string
  /**
   * 每页数量
   */
  limit: string
  /**
   * 偏移量
   */
  offset: string
  /**
   * 开始日期
   */
  start_date?: string
  /**
   * 用户ID
   */
  user_id: string
}

export interface AdminProjectListRes {
  /**
   * 项目内容，富文本
   */
  project_content: string
  /**
   * 项目ID
   */
  project_id: string
  /**
   * 项目名称
   */
  project_name: string
  /**
   * 名额
   */
  quota: string
  /**
   * 更新时间
   */
  update_time: string
}

export interface AdminProjectUpdateReq {
  /**
   * 项目内容，富文本
   */
  project_content: string
  /**
   * 项目ID
   */
  project_id: number
  /**
   * 项目名称
   */
  project_name: string
  /**
   * 名额
   */
  quota: string
}

export interface AdminProjectSearchReq {
  /**
   * 项目ID
   */
  project_id: number
}

export interface AdminProjectSearchRes {
  /**
   * 项目ID
   */
  product_id: string
  /**
   * 项目名称
   */
  product_name: string
  /**
   * 项目内容
   */
  proudct_content: string
  /**
   * 名额
   */
  quota: string
}

export interface AdminProjectCreateReq {
  /**
   * 项目内容，富文本
   */
  project_content: string
  /**
   * 项目名称
   */
  project_name: string
  /**
   * 名额
   */
  quota: string
}

export interface AdminProjectCreateRes {
  /**
   * 项目ID
   */
  product_id: string
  /**
   * 项目名称
   */
  product_name: string
  /**
   * 项目内容
   */
  proudct_content: string
  /**
   * 名额
   */
  quota: string
}

export interface AdminProjectDeleteReq {
  /**
   * 项目ID
   */
  project_id: number
}

export interface AdminActivityListReq {
  /**
   * 结束日期
   */
  end_date?: string
  /**
   * 每页数量
   */
  limit: string
  /**
   * 偏移量
   */
  offset: string
  /**
   * 开始日期
   */
  start_date?: string
  /**
   * 用户ID
   */
  user_id: string
}

export interface AdminActivityListRes {
  /**
   * 活动结束时间
   */
  activity_end_time: string
  /**
   * 活动ID
   */
  activity_id: string
  /**
   * 活动开始时间
   */
  activity_start_time: string
  /**
   * 报名详情，<指向>【管理】查询活动信息明细
   */
  apply_detail: string
  /**
   * 报名结束时间
   */
  apply_end_time: string
  /**
   * 报名链接，<指向>【用户】查询活动信息
   */
  apply_link: string
  /**
   * 报名开始时间
   */
  apply_start_time: string
  /**
   * 当前人数
   */
  number: string
  /**
   * 项目内容，富文本
   */
  project_content: string
  /**
   * 项目名称
   */
  project_name: string
  /**
   * 名额
   */
  quota: string
}

export interface AdminActivityDetailReq {
  /**
   * 活动ID
   */
  activity_id?: number
}

export interface AdminActivityDetailRes {
  /**
   * 详情
   */
  detail: AdminActivityDetail[]
  /**
   * 结束时间
   */
  end_time: string
  /**
   * 当前人数
   */
  number: string
  /**
   * 名额
   */
  quota: string
  /**
   * 开始时间
   */
  start_time: string
  total: string
}

export interface AdminActivityDetail {
  /**
   * 报名ID
   */
  apply_id: string
  /**
   * 报名时间
   */
  apply_time: string
  /**
   * 邮箱
   */
  email: string
  /**
   * 订单号
   */
  form_number: string
  /**
   * 年级
   */
  grade: string
  info_1: string
  info_2: string
  info_3: string
  info_4: string
  info_5: string
  info_6: string
  info_7: string
  info_8: string
  /**
   * 状态
   */
  state: string
  /**
   * 学号
   */
  student_id: string
  /**
   * 姓名
   */
  student_name: string
}

export interface AdminActivityCreateReq {
  /**
   * 活动结束时间
   */
  activity_end_time: string
  /**
   * 活动名称
   */
  activity_name: string
  /**
   * 活动开始时间
   */
  activity_start_time: string
  /**
   * 报名结束时间
   */
  apply_end_time: string
  /**
   * 报名开始时间
   */
  apply_start_time: string
  /**
   * 文本ID
   */
  content_id: string
  /**
   * 项目ID
   */
  project_id: number
}

export interface AdminActivityUpdateReq {
  /**
   * 活动ID
   */
  activity_id: number
  /**
   * 活动结束时间
   */
  activity_end_time: string
  /**
   * 活动名称
   */
  activity_name: string
  /**
   * 活动开始时间
   */
  activity_start_time: string
  /**
   * 报名结束时间
   */
  apply_end_time: string
  /**
   * 报名开始时间
   */
  apply_start_time: string
  /**
   * 文本ID
   */
  content_id: string
  /**
   * 项目ID
   */
  project_id: number
}

export interface AdminActivitySearchReq {
  /**
   * 活动ID
   */
  activity_id: number
}

export interface AdminActivitySearchRes {
  /**
   * 活动截止时间
   */
  activity_end_time: string
  /**
   * 活动ID
   */
  activity_id: string
  /**
   * 活动开始时间
   */
  activity_start_time: string
  /**
   * 报名截止时间
   */
  apply_end_time: string
  /**
   * 报名开始时间
   */
  apply_start_time: string
  /**
   * 项目ID
   */
  project_id: string
}

export interface AdminActivityDeleteReq {
  /**
   * 活动ID
   */
  activity_id: number
}

export interface AdminProjectNameListRes {
  /**
   * 项目ID
   */
  project_id: string
  /**
   * 项目名称
   */
  project_name: string
}

export interface AdminActivityNameListReq {
  start_time?: string
  end_time?: string
  limit: string
  offset: string
  title?: string[]
}

export interface AdminActivityNameListRes {
  /**
   * 活动ID
   */
  activity_id: string
  /**
   * 活动名称
   */
  activity_name: string
}

export interface QueryDataSearchApiReq {
  start_time?: string
  end_time?: string
  limit: string
  offset: string
  title?: string[]
}

export interface QueryDataSearchRes {
  seq: string
  aictivity_name: string
  order: string
  name: string
  number: string
  email: string
  time: string
  info_1: string
  info_2: string
  info_3: string
  info_4: string
  info_5: string
  info_6: string
  info_7: string
  info_8: string
}

export const adminProjectListApi = async (data: AdminProjectListReq) => {
  return await callApi<{
    detail: AdminProjectListRes[];
    total: string;
  }>(
    "manageProjectList",
    `query ManageProjectList($data: PageInput!) {
      manageProjectList(data: $data) { code msg data }
    }`,
    {
      data: {
        startDate: toMs(data.start_date),
        endDate: toMs(data.end_date),
        offset: toPage(data.offset),
        limit: toPage(data.limit),
      },
    }
  );
};

export const adminProjectUpdateApi = async (data: AdminProjectUpdateReq) => {
  return await callApi(
    "manageProjectUpdate",
    `mutation ManageProjectUpdate($data: ProjectUpdateInput!) {
      manageProjectUpdate(data: $data) { code msg data }
    }`,
    {
      data: {
        projectId: data.project_id,
        projectName: data.project_name,
        projectContent: data.project_content,
        quota: data.quota,
      },
    }
  );
};

export const adminProjectSearchApi = async (data: AdminProjectSearchReq) => {
  const res = await callApi<{
    project_id: string;
    project_name: string;
    proudct_content: string;
    quota: string;
    owner: string;
  }>(
    "manageProjectSearch",
    `query ManageProjectSearch($data: ProjectIdInput!) {
      manageProjectSearch(data: $data) { code msg data }
    }`,
    { data: { projectId: data.project_id } }
  );
  // 兼容旧 REST 响应字段命名(product_id/product_name/proudct_content)
  return {
    product_id: res.project_id,
    product_name: res.project_name,
    proudct_content: res.proudct_content,
    quota: res.quota,
    owner: res.owner,
  } as unknown as AdminProjectSearchRes;
};

export const adminProjectCreateApi = async (data: AdminProjectCreateReq) => {
  return await callApi(
    "manageProjectCreate",
    `mutation ManageProjectCreate($data: ProjectCreateInput!) {
      manageProjectCreate(data: $data) { code msg data }
    }`,
    {
      data: {
        projectName: data.project_name,
        projectContent: data.project_content,
        quota: data.quota,
        owner: (data as { owner?: string }).owner ?? "N/A",
      },
    }
  );
};

export const adminProjectDeleteApi = async (data: AdminProjectDeleteReq) => {
  return await callApi(
    "manageProjectDelete",
    `mutation ManageProjectDelete($data: ProjectIdInput!) {
      manageProjectDelete(data: $data) { code msg data }
    }`,
    { data: { projectId: data.project_id } }
  );
};

export const adminActivityListApi = async (data: AdminActivityListReq) => {
  return await callApi<{
    detail: AdminActivityListRes[];
    total: string;
  }>(
    "manageActivityList",
    `query ManageActivityList($data: PageInput!) {
      manageActivityList(data: $data) { code msg data }
    }`,
    {
      data: {
        startDate: toMs(data.start_date),
        endDate: toMs(data.end_date),
        offset: toPage(data.offset),
        limit: toPage(data.limit),
      },
    }
  );
};

export const adminActivityUpdateApi = async (data: AdminActivityUpdateReq) => {
  return await callApi(
    "manageActivityUpdate",
    `mutation ManageActivityUpdate($data: ActivityUpdateInput!) {
      manageActivityUpdate(data: $data) { code msg data }
    }`,
    {
      data: {
        activityId: data.activity_id,
        projectId: data.project_id,
        activityStartTime: tsToMs(data.activity_start_time),
        activityEndTime: tsToMs(data.activity_end_time),
        applyStartTime: tsToMs(data.apply_start_time),
        applyEndTime: tsToMs(data.apply_end_time),
      },
    }
  );
};

export const adminActivitySearchApi = async (data: AdminActivitySearchReq) => {
  return await callApi<AdminActivitySearchRes>(
    "manageActivitySearch",
    `query ManageActivitySearch($data: ActivityIdInput!) {
      manageActivitySearch(data: $data) { code msg data }
    }`,
    { data: { activityId: data.activity_id } }
  );
};

export const adminActivityCreateApi = async (data: AdminActivityCreateReq) => {
  return await callApi(
    "manageActivityCreate",
    `mutation ManageActivityCreate($data: ActivityCreateInput!) {
      manageActivityCreate(data: $data) { code msg data }
    }`,
    {
      data: {
        projectId: data.project_id,
        activityName: data.activity_name ?? null,
        activityStartTime: tsToMs(data.activity_start_time),
        activityEndTime: tsToMs(data.activity_end_time),
        applyStartTime: tsToMs(data.apply_start_time),
        applyEndTime: tsToMs(data.apply_end_time),
      },
    }
  );
};

export const adminActivityDeleteApi = async (data: AdminActivityDeleteReq) => {
  return await callApi(
    "manageActivityDelete",
    `mutation ManageActivityDelete($data: ActivityIdInput!) {
      manageActivityDelete(data: $data) { code msg data }
    }`,
    { data: { activityId: data.activity_id } }
  );
};

export const adminProjectNameListApi = async () => {
  return await callApi<{
    detail: AdminProjectNameListRes[];
    total: string;
  }>(
    "manageProjectNameList",
    `query ManageProjectNameList {
      manageProjectNameList { code msg data }
    }`
  );
};

export const adminActivityNameListApi = async (data: AdminActivityNameListReq) => {
  return await callApi<{
    detail: AdminActivityNameListRes[];
    total: string;
  }>(
    "manageActivityNameList",
    `query ManageActivityNameList($data: ActivityNameListInput!) {
      manageActivityNameList(data: $data) { code msg data }
    }`,
    {
      data: {
        startDate: toMs(data.start_time),
        endDate: toMs(data.end_time),
        offset: toPage(data.offset),
        limit: toPage(data.limit),
      },
    }
  );
};

export const adminActivityDetailApi = async (data: AdminActivityDetailReq) => {
  return await callApi<AdminActivityDetailRes>(
    "manageActivityDetail",
    `query ManageActivityDetail($activityId: Int!) {
      manageActivityDetail(activityId: $activityId) { code msg data }
    }`,
    { activityId: data.activity_id }
  );
};

export const queryTitleSearchApi = async () => {
  return await callApi<{
    title_list: string[];
  }>(
    "queryTitleSearch",
    `query QueryTitleSearch {
      queryTitleSearch { code msg data }
    }`
  );
};

export const queryDataSearchApi = async (data: QueryDataSearchApiReq) => {
  const startMs = toMs(data.start_time);
  const endMs = toMs(data.end_time);
  return await callApi<{
    result: QueryDataSearchRes[];
    total: string;
  }>(
    "queryDataSearch",
    `query QueryDataSearch($data: QueryDataInput!) {
      queryDataSearch(data: $data) { code msg data }
    }`,
    {
      data: {
        title: data.title ?? [],
        startTime: startMs === null ? null : Number(startMs),
        endTime: endMs === null ? null : Number(endMs),
        offset: toPage(data.offset),
        limit: toPage(data.limit),
      },
    }
  );
};

export const adminProjectOwnerSearchApi = async () => {
  return await callApi<{
    owner_list: string[];
  }>(
    "manageProjectOwnerSearch",
    `query ManageProjectOwnerSearch {
      manageProjectOwnerSearch { code msg data }
    }`
  );
};

/** File -> base64(不含 dataURL 前缀) */
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });

/** 批量上传排期(.xlsx,base64 传入);返回 { success, fail } */
export const adminActivityUploadApi = async (file: File) => {
  const fileBase64 = await fileToBase64(file);
  return await callApi<{ success: number; fail: number }>(
    "manageActivityUpload",
    `mutation ManageActivityUpload($fileName: String!, $fileBase64: String!, $contentType: String!) {
      manageActivityUpload(fileName: $fileName, fileBase64: $fileBase64, contentType: $contentType) { code msg data }
    }`,
    {
      fileName: file.name,
      fileBase64,
      contentType: file.type || "",
    }
  );
};

/** 下载 14 天批量排期模板(Excel,base64) */
export const adminActivityDownloadApi = async (): Promise<FileResponse> => {
  return await callFileApi(
    "manageActivityDownload",
    `query ManageActivityDownload {
      manageActivityDownload { code msg fileName fileBase64 }
    }`
  );
};

/** 导出报名数据(Excel,base64) */
export const adminActivityExportApi = async (data: {
  activity_list: string[];
  start_time?: string;
  end_time?: string;
}): Promise<FileResponse> => {
  return await callFileApi(
    "manageActivityExport",
    `query ManageActivityExport($data: ActivityExportInput!) {
      manageActivityExport(data: $data) { code msg fileName fileBase64 }
    }`,
    {
      data: {
        activityList: data.activity_list,
        startTime: toMs(data.start_time),
        endTime: toMs(data.end_time),
      },
    }
  );
};
