"use client";

import { usePathname } from "next/navigation";
import { DataProvider } from "@/context/DataContext";
import { Navigation } from "@/components/Navigation";
import { TextFieldArrowNavigation } from "@/components/TextFieldArrowNavigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <DataProvider>
      <div className="app-root">
        <Navigation />
        <TextFieldArrowNavigation />
        <main className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 sm:py-6">{children}</main>
      </div>
    </DataProvider>
  );
}
