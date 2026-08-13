"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertDialog, Button } from "@heroui/react";
import {
  IoBookOutline,
  IoExitOutline,
  IoFolderOutline,
  IoChevronBackOutline,
  IoChevronForwardOutline,
} from "react-icons/io5";
import { useUserStore } from "@/context/UserContext";

const BASE = "/f/aa/admin";

const breadcrumbTitleMap: Record<string, string> = {
  "project-management": "Subject",
  "activity-management": "Activities",
  "activity-detail": "Activity Detail",
  "report-export": "Report",
  "query-management": "Query",
};

const menuOptions = [
  {
    label: "AA",
    key: "admin",
    icon: IoBookOutline,
    children: [
      { label: "Subject", key: "project-management", icon: IoFolderOutline },
      { label: "Activities", key: "activity-management", icon: IoFolderOutline },
      { label: "Report", key: "report-export", icon: IoFolderOutline },
      // { label: "Query", key: "query-management", icon: IoFolderOutline },
    ],
  },
];

function LayoutSider() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const activeKey = pathname.split("/").pop() ?? "";

  return (
    <aside
      className="h-screen flex flex-col border-r border-gray-200 bg-white transition-all duration-200"
      style={{ width: collapsed ? 64 : 200 }}
    >
      <div
        className="h-[60px] flex justify-center items-center border-b border-gray-200 overflow-hidden"
        style={{ backgroundColor: "#763890" }}
      >
        <img src="/images/LOGO-2.png" alt="logo" className="max-w-full" />
      </div>
      <nav className="flex-1 overflow-y-auto py-1">
        {menuOptions.map((group) => (
          <div key={group.key}>
            <div
              className="flex items-center gap-2 px-4 py-2 text-gray-700"
              title={group.label}
            >
              <group.icon size={22} className="shrink-0" />
              {!collapsed && <span className="font-bold">{group.label}</span>}
            </div>
            {!collapsed &&
              group.children.map((item) => (
                <div
                  key={item.key}
                  onClick={() => router.push(`${BASE}/${item.key}`)}
                  className={`flex items-center gap-2 pl-10 pr-4 py-2 cursor-pointer text-gray-700 hover:bg-gray-100 ${
                    activeKey === item.key ? "text-[#763890] bg-purple-50 font-bold" : ""
                  }`}
                >
                  <item.icon size={22} className="shrink-0" />
                  <span>{item.label}</span>
                </div>
              ))}
          </div>
        ))}
      </nav>
      <div
        className="flex justify-center items-center h-12 border-t border-gray-200 cursor-pointer text-gray-600 hover:bg-gray-100"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? (
          <IoChevronForwardOutline size={20} />
        ) : (
          <IoChevronBackOutline size={20} />
        )}
      </div>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, logout } = useUserStore();

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { title: string; path: string }[] = [{ title: "AA", path: BASE }];
  const lastKey = segments[segments.length - 1];
  if (lastKey && breadcrumbTitleMap[lastKey]) {
    crumbs.push({ title: breadcrumbTitleMap[lastKey], path: pathname });
  }

  return (
    <div className="flex h-screen">
      <LayoutSider />
      <div className="flex-1 flex flex-col h-screen min-w-0">
        <header className="flex justify-between items-center h-[60px] px-5 bg-[#763890] border-b border-gray-200">
          <span className="font-bold text-white">{state.username}</span>
          <AlertDialog>
            <AlertDialog.Trigger>
              <Button variant="primary" size="sm">
                <IoExitOutline size={18} />
                Logout
              </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Backdrop>
              <AlertDialog.Container placement="center">
                <AlertDialog.Dialog>
                  <AlertDialog.Header>
                    <AlertDialog.Icon status="warning" />
                    <AlertDialog.Heading>Tips</AlertDialog.Heading>
                  </AlertDialog.Header>
                  <AlertDialog.Body>Are you sure to exist?</AlertDialog.Body>
                  <AlertDialog.Footer>
                    <AlertDialog.CloseTrigger>
                      <Button variant="ghost">Cancle</Button>
                    </AlertDialog.CloseTrigger>
                    <AlertDialog.CloseTrigger>
                      <Button variant="primary" onPress={() => logout()}>
                        Confirm
                      </Button>
                    </AlertDialog.CloseTrigger>
                  </AlertDialog.Footer>
                </AlertDialog.Dialog>
              </AlertDialog.Container>
            </AlertDialog.Backdrop>
          </AlertDialog>
        </header>
        <div className="flex items-center px-2 h-[40px] gap-2 text-sm">
          {crumbs.map((item, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span className="text-gray-400">/</span>}
              <span
                className={item.path === pathname ? "" : "cursor-pointer hover:text-[#763890]"}
                onClick={() => {
                  if (item.path === pathname) return;
                  router.push(item.path);
                }}
              >
                {item.title}
              </span>
            </span>
          ))}
        </div>
        <div className="overflow-y-auto p-2 bg-[#f0f2f5]" style={{ height: "calc(100vh - 100px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
