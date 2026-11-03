import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#211f1d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=Lora:wght@500;600&display=swap&subset=vietnamese" />
      </head>
      <body>{children}</body>
    </html>
  );
}
