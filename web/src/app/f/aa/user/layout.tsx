import AuthGuard from "@/components/AuthGuard";
import UserLayout from "@/components/aa/UserLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // SSO 回调页 oauth2 需在登录前可达，其余学生端页面均要求登录
    <AuthGuard publicPaths={["/f/aa/user/oauth2"]}>
      <UserLayout>{children}</UserLayout>
    </AuthGuard>
  );
}
