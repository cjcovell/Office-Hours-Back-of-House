import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { sendMagicLinkAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const { sent, error, next } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      {sent ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h1 className="text-xl font-semibold tracking-tight">
              Check your email
            </h1>
            <p className="text-sm text-muted-foreground">
              We sent a sign-in link to <strong>{sent}</strong>. Open it on
              this device to continue. The link expires after a few minutes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
              <p className="text-sm text-muted-foreground">
                We&rsquo;ll email you a magic link &mdash; no password.
              </p>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <form action={sendMagicLinkAction} className="space-y-3">
              <input type="hidden" name="next" value={next ?? "/"} />
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" className="w-full">
                Send magic link
              </Button>
            </form>

            <p className="text-xs text-muted-foreground">
              First time signing in? An admin still needs to link your account
              to a contributor profile (or grant admin role) before you can
              edit anything.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
