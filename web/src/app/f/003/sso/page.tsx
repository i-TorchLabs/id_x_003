"use client";

import { useEffect } from "react";
import { redirectToAdfsAuthorize } from "@/utils/sso";

/**
 * 学生 SSO 统一入口（对应原 /s/aa/login）：
 * 进入本页即生成 CSRF state 并 302 到 ADFS 授权页，
 * 授权完成后回调 /f/003/oauth2 完成 code → session 换取。
 */
export default function SsoEntryPage() {
  useEffect(() => {
    redirectToAdfsAuthorize();
  }, []);

  return (
    <div>
      <p>Redirecting to CUHK SSO...</p>
    </div>
  );
}
