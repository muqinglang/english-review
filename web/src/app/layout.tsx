import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "English Review",
  description: "把 ChatGPT 英语练习转成可持续的主动回忆复习。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
