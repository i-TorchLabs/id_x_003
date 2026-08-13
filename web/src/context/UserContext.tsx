"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { get } from "@/api/http";
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

  const logout = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    router.push("/f/aa/login");
  }, [router]);

  const userlogout = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    get({
      url: ADFS_LOGOUT_URL,
    });
    router.push("/f/aa/userlogout");
  }, [router]);

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
