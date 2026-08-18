import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat Review",
  description: "Turn ChatGPT conversations into sustainable active-recall review.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
