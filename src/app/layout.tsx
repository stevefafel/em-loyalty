import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

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
  title: "Mobil 1 Premium Growth Program",
  description: "B2B Premium Growth Program Portal for Auto Repair Shops",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${emprint.variable} font-sans antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
