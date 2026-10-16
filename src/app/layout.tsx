import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Music Swap",
  description: "Replace copyrighted music in brand content with original tracks that fit the edit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_50%_-10%,oklch(0.6_0.2_293/0.22),transparent)]" />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
