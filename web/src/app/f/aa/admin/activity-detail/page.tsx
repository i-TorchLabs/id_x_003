import { Suspense } from "react";
import ActivityManagementDetailView from "@/views/ActivityManagementDetailView";

export default function ActivityManagementDetailPage() {
  return (
    <Suspense>
      <ActivityManagementDetailView />
    </Suspense>
  );
}
