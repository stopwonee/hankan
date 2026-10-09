import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "한칸 | 타이핑으로 작성하는 나만의 원고지",
  description: "제목을 붙인 나만의 3권, 한 권에 최대 12장. 1,200칸 원고지, 백지, 모눈종이에 키보드와 펜슬로 생각을 담으세요.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preload" href="/fonts/PretendardVariable.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
