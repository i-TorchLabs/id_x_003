import { Suspense } from "react";
import UserApplyView from "@/views/UserApplyView";

export default function UserApplyPage() {
  return (
    <Suspense>
      <UserApplyView />
    </Suspense>
  );
}
