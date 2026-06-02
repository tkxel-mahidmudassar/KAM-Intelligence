import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { RoleProvider } from "@/context/RoleContext";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "KAM Intelligence",
  description: "Key Account Management Intelligence Platform — Tkxel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <RoleProvider>
            {children}
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
