import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AIChat } from "@/components/AIChat";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "R3CON",
  description: "Bank ↔ Payment Processor ↔ Internal Ledger Reconciliation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#1a1c2d] text-zinc-50 flex h-screen overflow-hidden`}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-[#1a1c2d]">
          {children}
        </main>
        <AIChat />
      </body>
    </html>
  );
}
