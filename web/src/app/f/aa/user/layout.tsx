import AuthGuard from "@/components/AuthGuard";
import UserLayout from "@/components/aa/UserLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <UserLayout>{children}</UserLayout>
    </AuthGuard>
  );
}
