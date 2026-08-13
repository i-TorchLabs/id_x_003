import Axios, { type AxiosResponse, type AxiosRequestHeaders } from "axios";
import qs from "qs";
import { API_BASE_URL } from "@/utils/config";

export const baseURL = API_BASE_URL || "/b/sme/aa/enlist";

export const CONTENT_TYPE = "Content-Type";

export const TOKEN = "token";

export const FORM_URLENCODED = "application/x-www-form-urlencoded; charset=UTF-8";

export const APPLICATION_JSON = "application/json; charset=UTF-8";

export const TEXT_PLAIN = "text/plain; charset=UTF-8";

const service = Axios.create({
  baseURL,
  timeout: 10 * 60 * 1000,
});

service.interceptors.request.use(
  (config) => {
    !config.headers && (config.headers = {} as AxiosRequestHeaders);
    if (!config.headers[CONTENT_TYPE]) {
      config.headers[CONTENT_TYPE] = APPLICATION_JSON;
    }
    if (config.headers[CONTENT_TYPE] === FORM_URLENCODED) {
      config.data = qs.stringify(config.data);
    }
    const userInfo = JSON.parse(
      (typeof window !== "undefined" && localStorage.getItem("userInfo")) || "{}"
    );
    if (userInfo.token) {
      config.headers[TOKEN] = userInfo.token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error.response);
  }
);

service.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if (response.status === 200) {
      return response;
    } else {
      throw new Error(response.status.toString());
    }
  },
  (error) => {
    if (process.env.NODE_ENV === "development") {
      console.log(error);
    }
    return Promise.reject({ code: 500, msg: "服务器异常，请稍后重试…" });
  }
);

export default service;
