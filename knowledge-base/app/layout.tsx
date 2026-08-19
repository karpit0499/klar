import type { Metadata } from "next";
import { SITE_URL, SOCIAL_IMAGE } from "../lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Klar Knowledge Base",
    template: "%s · Klar Knowledge Base",
  },
  description: "The governed product, user, engineering, security, and operations documentation for Klar.",
  icons: {
    icon: `${SITE_URL}/icon-192.png`,
    shortcut: `${SITE_URL}/icon-192.png`,
    apple: `${SITE_URL}/apple-touch-icon.png`,
  },
  openGraph: {
    title: "Klar Knowledge Base",
    description: "Clear, governed documentation for the Klar product and its implementation.",
    type: "website",
    siteName: "Klar Knowledge Base",
    url: SITE_URL,
    images: [{ url: SOCIAL_IMAGE, width: 1200, height: 630, alt: "Klar Knowledge Base" }],
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
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
