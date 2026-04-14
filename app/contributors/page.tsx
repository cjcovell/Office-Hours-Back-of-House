import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContributorCard } from "@/components/contributor-card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ContributorRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contributors" };

export default async function ContributorsIndexPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contributors")
    .select(
      "id, name, slug, show_role, role_types, headshot_url, bio, display_order"
    )
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return (
      <ErrorState message={`Failed to load contributors: ${error.message}`} />
    );
  }

  const contributors = (data ?? []) as Array<
    Pick<
      ContributorRow,
      "id" | "name" | "slug" | "show_role" | "role_types" | "headshot_url" | "bio"
    >
  >;
  const onAir = contributors.filter((c) => c.role_types.includes("on_air"));
  const crew = contributors.filter((c) => c.role_types.includes("crew"));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Contributors</h1>
        <p className="text-muted-foreground">
          Hosts, panelists, and the back-of-house crew. People who appear in
          both groups (panelist + workflow producer, etc.) show up under each.
        </p>
      </header>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({contributors.length})</TabsTrigger>
          <TabsTrigger value="on_air">On Air ({onAir.length})</TabsTrigger>
          <TabsTrigger value="crew">Back of House ({crew.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <Grid>
            {contributors.map((c) => (
              <ContributorCard key={c.id} contributor={c} />
            ))}
          </Grid>
        </TabsContent>
        <TabsContent value="on_air">
          <Grid>
            {onAir.map((c) => (
              <ContributorCard key={c.id} contributor={c} />
            ))}
          </Grid>
        </TabsContent>
        <TabsContent value="crew">
          <Grid>
            {crew.map((c) => (
              <ContributorCard key={c.id} contributor={c} />
            ))}
          </Grid>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}
