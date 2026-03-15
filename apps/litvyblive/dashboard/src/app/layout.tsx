import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "LitVybzLive — Admin Dashboard",
  description: "GhostChain L3 live-streaming platform management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-dark-bg text-white min-h-screen flex">
        <Providers>
          <Sidebar />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
