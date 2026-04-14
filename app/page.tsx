import Link from "next/link";
import { ArrowRight, Mic, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="space-y-16">
      <section className="space-y-6 pt-4">
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          What&rsquo;s in the Office Hours kit?
        </h1>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground">
          A live-updated catalog of the gear that powers the daily Office Hours
          Global broadcast — from the panelist desks on air to the racks,
          routers, and intercoms that keep back of house running.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/contributors">
              Browse contributors
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/gear">Open the gear catalog</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <Mic className="size-4" />
              <h2 className="font-semibold">On Air</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              The hosts and panelists you see every day. Their kits range from
              compact closet studios to full panelist rigs.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-2">
              <Wrench className="size-4" />
              <h2 className="font-semibold">Back of House</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              The crew who run the show. Multiviewers, intercom systems,
              routing, and rack gear viewers rarely get to see.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
