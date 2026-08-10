import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_URL, SOCIAL_IMAGE } from "../lib/site";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Klar Knowledge Base",
    template: "%s · Klar Knowledge Base",
  },
  description: "The governed product, user, engineering, security, and operations documentation for Klar.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Klar Knowledge Base",
    description: "Clear, governed documentation for the Klar product and its implementation.",
    type: "website",
    siteName: "Klar Knowledge Base",
    url: SITE_URL,
    images: [{ url: SOCIAL_IMAGE, width: 1731, height: 909, alt: "Klar Knowledge Base" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Klar Knowledge Base",
    description: "Understand Klar. Build it with confidence.",
    images: [SOCIAL_IMAGE],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
