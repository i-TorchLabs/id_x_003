"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { userLogoutApi } from "@/api/user";
import { ADFS_LOGOUT_URL } from "@/utils/config";

export interface UserState {
  username?: string;
  user_id: string;
  token: string; // Token
  role: string;
  check: string;
}

interface UserInfo {
  username: string;
  userId: string;
  role: string;
  token: string;
  check: string;
}

interface UserContextValue {
  state: UserInfo;
  saveUser: (userInfo: UserState) => Promise<UserState>;
  isTokenExpire: () => boolean;
  logout: () => void;
  userlogout: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<UserInfo>({
    username: "",
    userId: "",
    role: "",
    token: "",
    check: "",
  });

  const saveUser = useCallback((userInfo: UserState) => {
    localStorage.setItem("userInfo", JSON.stringify(userInfo));
    return new Promise<UserState>((resolve) => {
      setState({
        username: userInfo.username || "unkonw",
        userId: userInfo.user_id,
        role: userInfo.role || "user",
        token: userInfo.token,
        check: userInfo.check || "False",
      });
      resolve(userInfo);
    });
  }, []);

  const isTokenExpire = useCallback(() => {
    return !state.token;
  }, [state.token]);

  // 启动时从 localStorage 恢复用户(对应原 App.vue 逻辑)
  useEffect(() => {
    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "null");
    if (userInfo?.token) {
      saveUser(userInfo);
    }
  }, [saveUser]);

  /** 通知后端使会话 key 失效；失败不阻塞本地登出（静默降级） */
  const invalidateServerSession = useCallback(() => {
    try {
      const userInfo = JSON.parse(localStorage.getItem("userInfo") || "null");
      if (userInfo?.user_id) {
        // 不 await：登出是尽力而为的通知，网络/后端异常不应卡住用户
        userLogoutApi(userInfo.user_id).catch(() => undefined);
      }
    } catch {
      /* localStorage 数据损坏时直接跳过 */
    }
  }, []);

  /** 管理员登出：仅本地会话（账号密码体系，无 ADFS 会话） */
  const logout = useCallback(() => {
    invalidateServerSession();
    localStorage.clear();
    sessionStorage.clear();
    router.push("/f/aa/login");
  }, [router, invalidateServerSession]);

  /**
   * 学生登出：本地会话 + 服务端会话失效后，顶层跳转 ADFS 登出端点。
   *
   * 必须整页跳转而非 XHR/iframe：
   * - XHR 跨域受 CORS 阻拦，请求到不了 ADFS；
   * - iframe 属于第三方上下文，现代浏览器不携带 ADFS 会话 cookie；
   * 只有顶层导航才会携带 ADFS cookie 并真正清掉 SSO 会话，
   * 否则学生下次点 SSO 会被无感放行、无法更换账号。
   */
  const userlogout = useCallback(() => {
    invalidateServerSession();
    localStorage.clear();
    sessionStorage.clear();
    if ("caches" in window) {
      caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
    }
    window.location.href = ADFS_LOGOUT_URL;
  }, [invalidateServerSession]);

  return (
    <UserContext.Provider value={{ state, saveUser, isTokenExpire, logout, userlogout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserStore() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUserStore must be used within UserProvider");
  return ctx;
}
