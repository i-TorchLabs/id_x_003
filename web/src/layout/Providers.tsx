"use client";

import { ThemeProvider } from "@/context/ThemeContext";
import { UserProvider } from "@/context/UserContext";
import { Toast } from "@heroui/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UserProvider>
        <Toast.Provider placement="bottom end" maxVisibleToasts={5} />
        {children}
      </UserProvider>
    </ThemeProvider>
  );
}
