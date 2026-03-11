import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uptime Monitor | 全球边缘节点状态监控",
  description: "基于 Serverless 架构的自动化 URL 监控平台，提供实时状态展示、延迟统计与 Telegram 告警通知。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
