import type { Metadata } from "next";
import { Toaster } from "sonner";

import { FeedbackButton } from "@/components/feedback-button";
import { SiteHeader } from "@/components/site-header";
import { getCurrentAppUser } from "@/lib/supabase/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Office Hours: Back of House",
    template: "%s · Office Hours: Back of House",
  },
  description:
    "Gear catalog and contributor kits from the Office Hours Global team — on-air panelists and the crew who run back of house.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only show the feedback button to signed-in users. RLS would reject
  // an anonymous POST anyway, but gating the UI avoids the dead click.
  const me = await getCurrentAppUser();

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
        {me ? <FeedbackButton /> : null}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
