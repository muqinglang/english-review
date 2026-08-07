import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat Review",
  description: "把 ChatGPT 聊天沉淀成可持续的主动回忆复习。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
