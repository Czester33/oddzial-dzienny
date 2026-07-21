import type { Metadata } from "next";
import Script from "next/script";
import { Geist } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/context/DataContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Navigation } from "@/components/Navigation";
import { TextFieldArrowNavigation } from "@/components/TextFieldArrowNavigation";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const themeInitScript = `(function(){try{var t=localStorage.getItem("oddzial-theme");if(t==="light"){document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}else{document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}})();`;

export const metadata: Metadata = {
  title: "Oddział dzienny (wersja beta)",
  description:
    "Zarządzanie pacjentami, dyżurami i urlopami oddziału dziennego. Aplikacja w fazie testów — nie wszystkie funkcje mogą działać poprawnie.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={`${geistSans.variable} dark h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeProvider>
          <DataProvider>
            <Navigation />
            <TextFieldArrowNavigation />
            <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
