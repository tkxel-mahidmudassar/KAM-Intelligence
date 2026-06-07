import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/layout/AppShell";
import { NotificationProvider } from "@/context/NotificationContext";
import { RoleProvider } from "@/context/RoleContext";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "DotKAM",
  description: "Key account management intelligence by Tkxel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <RoleProvider>
            <NotificationProvider>
              <AppShell>{children}</AppShell>
            </NotificationProvider>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
