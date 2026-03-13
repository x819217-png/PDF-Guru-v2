import type { Metadata } from "next";
import "./globals.css";

export const runtime = 'edge';

export const metadata: Metadata = {
  title: "SumifyPDF - AI PDF Summarizer | Instant Smart Summaries",
  description: "Summarize any PDF instantly with AI. Supports scanned documents, batch processing, and chat with your PDF. Free to try.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
