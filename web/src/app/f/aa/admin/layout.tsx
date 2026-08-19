import AuthGuard from "@/components/AuthGuard";
import AdminLayout from "@/components/aa/AdminLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // 管理后台全部页面要求 admin 角色
    <AuthGuard role="admin">
      <AdminLayout>{children}</AdminLayout>
    </AuthGuard>
  );
}
