import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Source Model Tracker",
  description: "Track which free AI models are available across NVIDIA, OpenCode, and OpenRouter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen transition-colors">{children}</body>
    </html>
  );
}
