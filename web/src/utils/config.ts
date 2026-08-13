export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "";
export const SUB_VERSION = process.env.NEXT_PUBLIC_SUB_VERSION ?? "/b/sme/aa/enlist";
export const API_BASE_URL = `${BASE_URL}${SUB_VERSION}`;

/** 外部站点(下载模板/报表导出/学生端跳转/ADFS 相关) */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://sme-activity-apply.cuhk.edu.cn:8000";

/** ADFS OAuth2 登出端点 */
export const ADFS_LOGOUT_URL = "https://sts.cuhk.edu.cn/adfs/oauth2/logout";
