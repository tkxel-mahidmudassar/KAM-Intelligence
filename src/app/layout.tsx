import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { RoleBar } from "@/components/layout/RoleBar";
import { RoleProvider } from "@/context/RoleContext";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "KAM Intelligence V2",
  description: "Enhanced Key Account Management Intelligence Platform by Tkxel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <RoleProvider>
            <RoleBar />
            {children}
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
