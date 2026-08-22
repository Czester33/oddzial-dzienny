"use client";

import { usePathname } from "next/navigation";
import { DataProvider } from "@/context/DataContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { Navigation } from "@/components/Navigation";
import { SyncStatusBar } from "@/components/SyncStatusBar";
import { TextFieldArrowNavigation } from "@/components/TextFieldArrowNavigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <DataProvider>
      <ConfirmProvider>
        <div className="app-root">
          <Navigation />
          <SyncStatusBar />
          <TextFieldArrowNavigation />
          <main className="mx-auto max-w-[1600px] px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6">{children}</main>
        </div>
      </ConfirmProvider>
    </DataProvider>
  );
}
