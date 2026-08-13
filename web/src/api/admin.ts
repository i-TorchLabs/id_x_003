import { post, get } from './http'
import {
  adminActivityCreate,
  adminActivityDelete,
  adminActivityDetail,
  adminActivityList,
  adminActivityNameList,
  adminActivitySearch,
  adminActivityUpdate,
  adminProjectCreate,
  adminProjectDelete,
  adminProjectList,
  adminProjectNameList,
  adminProjectOwnerSearch,
  adminProjectSearch,
  adminProjectUpdate,
  queryDataSearch,
  queryTitleSearch
} from './url'

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
  project_id: string
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
  project_id: string
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
  project_id: string
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
  activity_id?: string
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
  project_id: string
}

export interface AdminActivityUpdateReq {
  /**
   * 活动ID
   */
  activity_id: string
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
  project_id: string
}

export interface AdminActivitySearchReq {
  /**
   * 活动ID
   */
  activity_id: string
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
  activity_id: string
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
  const { data: resData } = await post({
    url: adminProjectList,
    data
  })

  return resData as unknown as {
    detail: AdminProjectListRes[]
    total: string
  }
}

export const adminProjectUpdateApi = async (data: AdminProjectUpdateReq) => {
  return await post({
    url: adminProjectUpdate,
    data
  })
}

export const adminProjectSearchApi = async (data: AdminProjectSearchReq) => {
  return (
    await post({
      url: adminProjectSearch,
      data
    })
  )?.data as unknown as AdminProjectSearchRes
}

export const adminProjectCreateApi = async (data: AdminProjectCreateReq) => {
  return await post({
    url: adminProjectCreate,
    data
  })
}

export const adminProjectDeleteApi = async (data: AdminProjectDeleteReq) => {
  return await post({
    url: adminProjectDelete,
    data
  })
}

export const adminActivityListApi = async (data: AdminActivityListReq) => {
  const { data: resData } = await post({
    url: adminActivityList,
    data
  })

  return resData as unknown as {
    detail: AdminActivityListRes[]
    total: string
  }
}

export const adminActivityUpdateApi = async (data: AdminActivityUpdateReq) => {
  return await post({
    url: adminActivityUpdate,
    data
  })
}

export const adminActivitySearchApi = async (data: AdminActivitySearchReq) => {
  return (
    await post({
      url: adminActivitySearch,
      data
    })
  ).data as unknown as AdminActivitySearchRes
}

export const adminActivityCreateApi = async (data: AdminActivityCreateReq) => {
  return await post({
    url: adminActivityCreate,
    data
  })
}

export const adminActivityDeleteApi = async (data: AdminActivityDeleteReq) => {
  return await post({
    url: adminActivityDelete,
    data
  })
}

export const adminProjectNameListApi = async () => {
  const { data: resData } = await post({
    url: adminProjectNameList
  })

  return resData as unknown as {
    detail: AdminProjectNameListRes[]
    total: string
  }
}
export const adminActivityNameListApi = async (data: AdminActivityNameListReq) => {
  const { data: resData } = await post({
    url: adminActivityNameList,
    data
  })

  return resData as unknown as {
    detail: AdminActivityNameListRes[]
    total: string
  }
}

export const adminActivityDetailApi = async (data: AdminActivityDetailReq) => {
  const { data: resData } = await get({
    url: adminActivityDetail,
    data
  })

  return resData as unknown as AdminActivityDetailRes
}

export const queryTitleSearchApi = async () => {
  const { data: resData } = await post({
    url: queryTitleSearch
  })

  return resData as unknown as {
    title_list: string[]
  }
}
export const queryDataSearchApi = async (data: QueryDataSearchApiReq) => {
  const { data: resData } = await post({
    url: queryDataSearch,
    data
  })

  return resData as unknown as {
    result: QueryDataSearchRes[],
    total: string
  }
}
export const adminProjectOwnerSearchApi = async () => {
  const { data: resData } = await post({
    url: adminProjectOwnerSearch
  })

  return resData as unknown as {
    owner_list: string[],
  }
}
