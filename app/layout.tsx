import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VNAI",
  description: "VNAI – AI Chat Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
