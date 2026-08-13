import { post, get } from './http'
import { userAcitvityApply, userAcitvityDelete, userAcitvityDetail, userAcitvityList, userAcitvitySearch } from './url'

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

export const userAcitvityListApi = async (data: UserAcitvityListReq) => {
  const { data: resData } = await post({
    url: userAcitvityList,
    data
  })

  return resData as unknown as UserAcitvityListRes
}

export const userAcitvitySearchApi = async (data: UserAcitvitySearchReq) => {
  const { data: resData } = await get({
    url: userAcitvitySearch,
    data
  })

  return resData as unknown as UserAcitvitySearchRes
}

export const userAcitvityDetailApi = async (data: UserAcitvityDetailReq) => {
  const { data: resData } = await post({
    url: userAcitvityDetail,
    data
  })

  return resData as unknown as UserAcitvityDetailRes
}

export const userAcitvityApplyApi = async (data: UserAcitvityApplyReq) => {
  await post({
    url: userAcitvityApply,
    data
  })
}

export const userAcitvityDeleteApi = async (data: UserAcitvityDeleteReq) => {
  await post({
    url: userAcitvityDelete,
    data
  })
}
