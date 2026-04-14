import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Office Hours: Back of House",
    template: "%s · Office Hours: Back of House",
  },
  description:
    "Gear catalog and contributor kits from the Office Hours Global team — on-air panelists and the crew who run back of house.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <SiteHeader />
        <main className="container mx-auto max-w-6xl px-4 py-8 sm:py-12">
          {children}
        </main>
        <footer className="mt-16 border-t border-border py-8">
          <div className="container mx-auto max-w-6xl px-4 text-xs text-muted-foreground">
            <p>
              As an Amazon Associate, Office Hours earns from qualifying
              purchases. Outbound product links may be affiliate links.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
