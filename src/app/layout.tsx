import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Shorts Studio",
  description: "Automated YouTube Shorts generation and publishing.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
