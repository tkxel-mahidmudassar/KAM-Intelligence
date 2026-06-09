import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/layout/AppShell";
import { AccountCacheProvider } from "@/context/AccountCacheContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { RoleProvider } from "@/context/RoleContext";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "Kamazing",
  description: "Key account workspace by Tkxel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <RoleProvider>
            <AccountCacheProvider>
              <NotificationProvider>
                <AppShell>{children}</AppShell>
              </NotificationProvider>
            </AccountCacheProvider>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
