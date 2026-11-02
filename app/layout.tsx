import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VNAI — AI mỏ hỗn",
  description: "AI giả đần, mồm láo, nhưng biết tuốt. Hỏi gì cũng trả lời đúng, hỏi ngu là ăn chửi.",
  metadataBase: new URL("https://www.vina-ai.com"),
  openGraph: {
    title: "VNAI — AI mỏ hỗn",
    description: "Hỏi gì cũng trả lời đúng. Hỏi ngu là ăn chửi. Thử đi nếu dám.",
    url: "https://www.vina-ai.com",
    siteName: "VNAI",
    locale: "vi_VN",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
