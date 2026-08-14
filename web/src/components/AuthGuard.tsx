"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // 与 UserContext 保持一致：凭证存储在 localStorage 的 userInfo 中
    let token: string | null = null;
    try {
      token = JSON.parse(localStorage.getItem("userInfo") || "null")?.token ?? null;
    } catch {
      token = null;
    }
    if (!token) {
      router.push("/f/aa/login");
    }
  }, [router]);

  return <>{children}</>;
}
