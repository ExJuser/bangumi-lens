import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bangumi Lens",
  description: "辅助阅读 Bangumi 动画章节评论区的单集报告生成器"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
