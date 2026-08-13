"use client";

import { useEffect } from "react";
import { SITE_URL } from "@/utils/config";

export default function LogoutView() {
  useEffect(() => {
    // 原 router 守卫逻辑:清空 Cache Storage 后硬跳转学生端登录页
    if ("caches" in window) {
      caches.keys().then((cacheNames) => {
        cacheNames.forEach((cacheName) => {
          caches.delete(cacheName);
        });
        window.location.href = `${SITE_URL}/s/aa/login`;
      });
    } else {
      (window as Window).location.href = `${SITE_URL}/s/aa/login`;
    }
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: "Logout Successful." }} />;
}
