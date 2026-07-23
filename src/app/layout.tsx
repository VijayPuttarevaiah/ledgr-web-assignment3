import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LEDGR — Every dollar. Every split. One place.",
  description:
    "Personal finance and collaborative bill-splitting, unified: your share of any shared expense flows straight into your personal ledger and analytics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-bg font-sans text-text">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
