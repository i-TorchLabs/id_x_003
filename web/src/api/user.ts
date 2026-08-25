import dayjs from "dayjs";
import { callApi, graphqlRequest, type ApiResponse } from "./graphql";
import { encryptLoginCredentials } from "@/utils/crypto";

/**
 * 学生端 + 认证 GraphQL API(对应后端 src/controllers/x_controllers.py)
 * 说明:
 * - 字段名遵循 Strawberry 默认 camelCase 规则
 * - 分页 offset 为页码(从 1 开始)、limit 为每页数量,均为整型
 * - 时间筛选参数为毫秒时间戳字符串;'yyyy-MM-dd HH:mm'/'yyyy-MM-ddTHH:mm' 在此统一转换
 */

/** 'yyyy-MM-dd HH:mm' / 'yyyy-MM-ddTHH:mm' -> 毫秒时间戳字符串;空值 -> null */
const toMs = (v?: string | null): string | null => {
  if (!v) return null;
  return String(dayjs(String(v).replace("T", " ")).valueOf());
};

const toPage = (v?: string | number): number => Number(v ?? 1);

export interface UserAcitvityListReq {
  /**
   * 结束日期
   */
  end_data?: string
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

/**
 * 响应数据
 */
export interface UserAcitvityListRes {
  /**
   * 日期
   */
  date: string
  detail: UserAcitvity[]
  /**
   * 星期
   */
  week: string
  total: number
}

export interface UserAcitvity {
  /**
   * 活动ID
   */
  activity_id: string
  /**
   * 活动名称
   */
  activity_name: string
  /**
   * 结束时间
   */
  end_time: string
  /**
   * 当前数量
   */
  number: string
  /**
   * 总名额
   */
  quota: string
  /**
   * 开始时间
   */
  start_time: string
  /**
   * 开放状态，{"0": "关闭", "1": "开放", "2": "满额"}
   */
  state: string
  /**
   * 日期
   */
  date: string
  start_time_show: string
  end_time_show: string
}

export interface UserAcitvitySearchReq {
  /**
   * 活动ID
   */
  activity_id?: string
}

type DetailItem = {
  /**
   * 描述
   */
  item: string
  /**
   * 是否禁用
   */
  state: 'disable' | 'enable'
}

/**
 * 响应数据
 */
export interface UserAcitvitySearchRes {
  /**
   * 活动内容
   */
  activity_content: string
  /**
   * 活动名称
   */
  activity_name: string
  /**
   * 日期
   */
  date: string
  /**
   * 详情
   */
  detail: Record<string, Record<string, DetailItem[]>>
  /**
   * 截止时间
   */
  end_time: string
  /**
   * 开始时间
   */
  start_time: string
  /**
   * 开放状态
   */
  state: string
  /**
   * 星期
   */
  week: string
}

export interface UserAcitvityApplyReq {
  /**
   * 活动ID
   */
  activity_id: string
  detail: {
    [key: string]: string
  }
  /**
   * 用户ID
   */
  user_id: string
  [property: string]: any
}
export interface UserAcitvityDeleteReq {
  /**
   * 报名ID
   */
  apply_id: string
  /**
   * 用户ID
   */
  user_id: string
}

export interface UserAcitvityDetailReq {
  /**
   * 每页个数
   */
  limit: string
  /**
   * 页码
   */
  offset: string
  /**
   * 用户ID
   */
  user_id: string
}

/**
 * 响应数据
 */
export interface UserAcitvityDetailRes {
  detail: UserAcitvityDetail[]
  /**
   * 总数
   */
  total: string
}

export interface UserAcitvityDetail {
  /**
   * 报名ID
   */
  apply_id: string
  /**
   * 结束时间
   */
  end_time: string
  /**
   * 描述
   */
  message: string
  /**
   * 活动名称
   */
  name: string
  /**
   * 选项
   */
  options: string
  /**
   * 订单号
   */
  order: string
  /**
   * 开始时间
   */
  start_time: string
  /**
   * 状态
   */
  state: string
  /**
   * 报名时间
   */
  time: string
}


/** 管理员账号密码登录（支持验证码，漏洞报告 #3）
 *  传输加密：用户名/密码先经后端 loginKey 公钥 RSA-OAEP(SHA-256) 加密，
 *  后端以内存私钥解密，明文不出现在网络载荷中。
 *  返回完整 ApiResponse.data：登录成功含 user_id/token/role；
 *  触发验证码时含 need_captcha/captcha_id/image_base64，由页面展示验证码。
 */
export const loginApi = async (data: {
  username: string;
  password: string;
  captcha_id?: string;
  captcha_code?: string;
}) => {
  const encrypted = await encryptLoginCredentials(data.username, data.password);
  const res = await graphqlRequest(
    `mutation Login($data: LoginInput!) {
      login(data: $data) { code msg data }
    }`,
    {
      data: {
        username: encrypted.username,
        password: encrypted.password,
        encrypted: true,
        captchaId: data.captcha_id || "",
        captchaCode: data.captcha_code || "",
      },
    }
  );
  const resp = res.login as ApiResponse<{
    user_id?: string;
    token?: string;
    role?: string;
    need_captcha?: string;
    captcha_id?: string;
    image_base64?: string;
  }>;
  if (resp.code === 200) {
    return resp.data as { user_id: string; token: string; role: string };
  }
  // 非 200：抛出携带完整 data 的错误，页面据此判断是否展示验证码
  const err: any = new Error(resp.msg || "登录失败");
  err.code = resp.code;
  err.data = resp.data || {};
  throw err;
};

/** 学生 SSO 登录(首次自动建档) */
export const userAcitvityOauthApi = async (oauthToken: string) => {
  return await callApi<{
    check: string;
    username: string;
    user_id: string;
    token: string;
  }>(
    "userActivityOauth",
    `mutation UserActivityOauth($data: OauthInput!) {
      userActivityOauth(data: $data) { code msg data }
    }`,
    { data: { oauthToken } }
  );
};

export const userAcitvityListApi = async (data: UserAcitvityListReq & { fuzzy_name?: string }) => {
  return await callApi<UserAcitvityListRes>(
    "userActivityList",
    `query UserActivityList($data: UserActivityListInput!) {
      userActivityList(data: $data) { code msg data }
    }`,
    {
      data: {
        startDate: toMs(data.start_date),
        endDate: toMs(data.end_data ?? (data as { end_date?: string }).end_date),
        offset: toPage(data.offset),
        limit: toPage(data.limit),
        fuzzyName: data.fuzzy_name ?? "",
      },
    }
  );
};

export const userAcitvitySearchApi = async (data: UserAcitvitySearchReq) => {
  return await callApi<UserAcitvitySearchRes>(
    "userActivitySearch",
    `query UserActivitySearch($activityId: String!) {
      userActivitySearch(activityId: $activityId) { code msg data }
    }`,
    { activityId: data.activity_id }
  );
};

export const userAcitvityDetailApi = async (data: UserAcitvityDetailReq) => {
  return await callApi<UserAcitvityDetailRes>(
    "userActivityDetail",
    `query UserActivityDetail($data: UserRecordsInput!) {
      userActivityDetail(data: $data) { code msg data }
    }`,
    {
      data: {
        userId: data.user_id,
        offset: toPage(data.offset),
        limit: toPage(data.limit),
      },
    }
  );
};

export const userAcitvityApplyApi = async (data: UserAcitvityApplyReq) => {
  await callApi(
    "userActivityApply",
    `mutation UserActivityApply($data: UserActivityApplyInput!) {
      userActivityApply(data: $data) { code msg data }
    }`,
    {
      data: {
        userId: data.user_id,
        activityId: data.activity_id,
        info: data.detail?.info ?? "",
      },
    }
  );
};

export const userAcitvityDeleteApi = async (data: UserAcitvityDeleteReq) => {
  await callApi(
    "userActivityDelete",
    `mutation UserActivityDelete($data: UserApplyDeleteInput!) {
      userActivityDelete(data: $data) { code msg data }
    }`,
    {
      data: {
        userId: data.user_id,
        applyId: data.apply_id,
      },
    }
  );
};
