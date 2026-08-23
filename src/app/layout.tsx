import type { Metadata, Viewport } from "next";
import "./globals.css";
import { STORAGE_KEYS } from "@/lib/storage";

export const metadata: Metadata = {
  title: "Open Source Model Tracker",
  description: "Track which free AI models are available across NVIDIA, OpenCode, and OpenRouter",
  openGraph: {
    title: "Open Source Model Tracker",
    description: "Which free AI models are live right now across NVIDIA NIM, OpenCode Zen, and OpenRouter",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
  ],
};

// Applies the persisted theme before first paint so light-mode users don't
// get a dark flash; runs synchronously in <head>, ahead of hydration.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("${STORAGE_KEYS.THEME}");if(t==="light"){var d=document.documentElement;d.classList.remove("dark");d.classList.add("light")}}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen transition-colors">{children}</body>
    </html>
  );
}
