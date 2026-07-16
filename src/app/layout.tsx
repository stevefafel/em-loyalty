import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const oneTrustDomainId = process.env.NEXT_PUBLIC_ONETRUST_DOMAIN_ID;

const emprint = localFont({
  src: [
    {
      path: "../fonts/EMprint-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/EMprint-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/EMprint-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/EMprint-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-emprint",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Mobil 1 Premium Growth Program",
    template: "%s | Mobil 1 Premium Growth",
  },
  description: "B2B Premium Growth Program Portal for Auto Repair Shops",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {oneTrustDomainId && (
        <>
          <Script
            src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"
            data-domain-script={oneTrustDomainId}
            data-document-language="true"
            strategy="beforeInteractive"
          />
          {/* OneTrust calls this after load and on every consent change */}
          <Script id="onetrust-wrapper" strategy="beforeInteractive">
            {`function OptanonWrapper() {}`}
          </Script>
        </>
      )}
      <body className={`${emprint.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
