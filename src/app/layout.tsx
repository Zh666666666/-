import type { Metadata } from "next";

import { RoleNavigation } from "@/components/role-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "TKA 术后膝关节康复监测管理平台",
  description: "面向老人、护士与康复团队的智能护膝实时监测平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <RoleNavigation />
      </body>
    </html>
  );
}
