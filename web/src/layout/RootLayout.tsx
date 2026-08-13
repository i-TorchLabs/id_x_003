import type { Metadata } from "next";
import "@/assets/styles/globals.css";
import Providers from "./Providers";

export const metadata: Metadata = {
  title: "Welcome to AA AMS",
  description: "SME Alumni Advising Activity Management System",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
