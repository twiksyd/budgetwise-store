import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { StorefrontChrome } from "@/components/layout/storefront-chrome";
import { Toaster } from "@/components/ui/sonner";
import { siteConfig } from "@/config/site";
import { resolveStoreStatusSafe } from "@/lib/store-status";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-heading",
  subsets: ["latin"],
});

const defaultTitle = `${siteConfig.name} — ${siteConfig.slogan}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: defaultTitle,
    template: "%s | BudgetWise",
  },
  description: siteConfig.description,
  openGraph: {
    title: defaultTitle,
    description: siteConfig.ogDescription,
    siteName: siteConfig.name,
    url: siteConfig.url,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: siteConfig.ogDescription,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { status, noticeMessage } = await resolveStoreStatusSafe();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} flex min-h-screen flex-col antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <MotionProvider>
            <StorefrontChrome status={status} noticeMessage={noticeMessage}>
              {children}
            </StorefrontChrome>
            <Toaster position="top-center" />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
