import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import { RoleNavigation } from "@/components/role-navigation";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

/* 衬线体只做点缀：编号、度数、英文引语。正文与标题仍是无衬线。 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "TKA 术后膝关节康复监测管理平台",
  description: "面向家属、护士与康复团队的智能护膝实时监测平台",
};

export const viewport: Viewport = {
  themeColor: "#0b1512",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        {children}
        <RoleNavigation />
      </body>
    </html>
  );
}
