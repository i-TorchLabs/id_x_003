export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "";
export const SUB_VERSION = process.env.NEXT_PUBLIC_SUB_VERSION ?? "/b/id_x_003/graphql";
export const API_BASE_URL = `${BASE_URL}${SUB_VERSION}`;

/** 外部站点(下载模板/报表导出/学生端跳转/ADFS 相关) */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://sme-cloud.cuhk.edu.cn";

/** ADFS OAuth2 端点 */
export const ADFS_BASE_URL = "https://sts.cuhk.edu.cn/adfs/oauth2";
export const ADFS_AUTHORIZE_URL = `${ADFS_BASE_URL}/authorize`;
export const ADFS_LOGOUT_URL = `${ADFS_BASE_URL}/logout`;

/**
 * ADFS OAuth2 授权码授予流配置
 * - client_id 为公开标识（会出现在浏览器跳转 URL 中），可直接写死；
 * - client_secret 仅服务端持有，严禁写入前端代码 / 环境变量；
 * - redirect_uri 必须与 ADFS 注册地址完全一致（https，区分大小写）；
 * - NEXT_PUBLIC_* 环境变量仅用于需要覆盖默认值的场景（构建期内联）。
 */
export const ADFS_CLIENT_ID =
  process.env.NEXT_PUBLIC_ADFS_CLIENT_ID ??
  "6044b8ba-3961-4931-83bc-4edd845e4983";
export const ADFS_REDIRECT_URI =
  process.env.NEXT_PUBLIC_ADFS_REDIRECT_URI ??
  `${SITE_URL}/f/003/oauth2`;
export const ADFS_RESOURCE =
  process.env.NEXT_PUBLIC_ADFS_RESOURCE ?? SITE_URL;
