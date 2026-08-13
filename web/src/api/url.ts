import { baseURL } from "./axios.config";

export const baseAddress = baseURL;

export const login = "/login";
export const logout = "/logout";

// 项目管理
export const adminProjectList = "/manage/project/list";
export const adminProjectUpdate = "/manage/project/update";
export const adminProjectSearch = "/manage/project/search";
export const adminProjectCreate = "/manage/project/create";
export const adminProjectDelete = "/manage/project/delete";
export const adminProjectOwnerSearch = "/manage/project/owner/search";

// 活动管理
export const adminActivityList = "/manage/activity/list";
export const adminActivityDetail = "/manage/activity/detail";
export const adminActivityCreate = "/manage/activity/create";
export const adminActivityUpdate = "/manage/activity/update";
export const adminActivitySearch = "/manage/activity/search";
export const adminActivityDelete = "/manage/activity/delete";
export const adminProjectNameList = "/manage/project/name_list";

// 报名管理
export const adminActivityNameList = "/manage/activity/name_list";

// 用户活动
export const userAcitvityList = "/user/acitvity/list";
export const userAcitvitySearch = "/user/acitvity/search";
export const userAcitvityApply = "/user/acitvity/apply";
export const userAcitvityDelete = "/user/acitvity/delete";
export const userAcitvityDetail = "/user/acitvity/detail";
export const userAcitvityOauth = "/user/acitvity/oauth";

// 参数查询
export const queryTitleSearch = "/manage/query/title/search";
export const queryDataSearch = "/manage/query/data/search";

// 代码中硬编码的额外端点
export const adminActivityUpload = "/manage/activity/upload";
export const adminActivityDownload = "/manage/activity/download";
export const adminActivityExport = "/manage/activity/export";
