import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BrandingStyles } from "@/components/branding/branding-styles";
import {
  ScrollRestoration,
  ScrollRestorationScript,
} from "@/components/scroll-restoration";
import { APP_METADATA } from "@/lib/branding-config";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_METADATA.title,
  description: APP_METADATA.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
        <ScrollRestorationScript />
      </head>
      <body className="min-h-full w-full overflow-x-hidden bg-background font-sans text-foreground">
        <ScrollRestoration />
        <BrandingStyles />
        {children}
      </body>
    </html>
  );
}
