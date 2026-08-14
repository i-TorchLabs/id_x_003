"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AlertDialog, Button } from "@heroui/react";
import { IoExitOutline } from "react-icons/io5";
import { useUserStore } from "@/context/UserContext";

interface UserLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function UserLayout({ children, title }: UserLayoutProps) {
  const { userlogout } = useUserStore();
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen">
      <header className="flex justify-between items-center h-[60px] pr-5 bg-[#763890] border-b border-gray-200">
        <div className="h-full flex items-center overflow-hidden">
          <img src="/images/LOGO-2.png" alt="logo" className="h-full w-auto object-cover" />
        </div>
        <span className="font-bold text-white">{title}</span>
        <AlertDialog isOpen={logoutOpen} onOpenChange={setLogoutOpen}>
          <AlertDialog.Trigger>
            <Button variant="primary" size="sm">
              <IoExitOutline size={18} />
              Logout
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Backdrop>
            <AlertDialog.Container placement="center">
              <AlertDialog.Dialog className="min-w-[360px]">
                <AlertDialog.Header>
                  <AlertDialog.Icon status="warning" />
                  <AlertDialog.Heading>Tips</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>Are you sure to exist?</AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button variant="ghost" onPress={() => setLogoutOpen(false)}>
                    Cancle
                  </Button>
                  <Button
                    variant="primary"
                    onPress={() => {
                      setLogoutOpen(false);
                      userlogout();
                    }}
                  >
                    Confirm
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog>
      </header>
      <div className="overflow-y-auto p-2 bg-[#f0f2f5]" style={{ height: "calc(100vh - 60px)" }}>
        <div className="min-w-[600px] max-w-[1120px] m-auto">{children}</div>
      </div>
    </div>
  );
}
