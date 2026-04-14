import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  sendOtpCodeAction,
  signInWithPasswordAction,
  verifyOtpCodeAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

type SearchParams = {
  method?: string; // "password" | "code"
  step?: string; // "verify"
  email?: string;
  error?: string;
  next?: string;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { method, step, email, error, next } = await searchParams;
  const safeNext = next ?? "/";

  if (step === "verify" && email) {
    return <VerifyForm email={email} next={safeNext} error={error} />;
  }

  const defaultTab: "password" | "code" = method === "code" ? "code" : "password";

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Pick your preferred method.
            </p>
          </div>

          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="code">Email code</TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="space-y-3">
              {error && method === "password" ? (
                <ErrorBanner error={error} />
              ) : null}
              <form action={signInWithPasswordAction} className="space-y-3">
                <input type="hidden" name="next" value={safeNext} />
                <div className="space-y-2">
                  <Label htmlFor="pwd-email">Email</Label>
                  <Input
                    id="pwd-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pwd-password">Password</Label>
                  <Input
                    id="pwd-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="code" className="space-y-3">
              {error && method === "code" ? (
                <ErrorBanner error={error} />
              ) : null}
              <form action={sendOtpCodeAction} className="space-y-3">
                <input type="hidden" name="next" value={safeNext} />
                <div className="space-y-2">
                  <Label htmlFor="otp-email">Email</Label>
                  <Input
                    id="otp-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Send code
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                We&rsquo;ll email you a six-digit code. No password required.
              </p>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground">
            First time signing in? An admin still needs to link your account
            to a contributor profile (or grant admin role) before you can
            edit anything.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function VerifyForm({
  email,
  next,
  error,
}: {
  email: string;
  next: string;
  error?: string;
}) {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              Enter your code
            </h1>
            <p className="text-sm text-muted-foreground">
              We sent a six-digit code to <strong>{email}</strong>. It
              expires in 10 minutes.
            </p>
          </div>

          {error ? <ErrorBanner error={error} /> : null}

          <form action={verifyOtpCodeAction} className="space-y-3">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="token">Code</Label>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                className="text-center font-mono text-xl tracking-[0.5em]"
              />
            </div>
            <Button type="submit" className="w-full">
              Verify &amp; sign in
            </Button>
          </form>

          <div className="flex items-center justify-between text-xs">
            <form action={sendOtpCodeAction}>
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                className="text-muted-foreground underline hover:text-foreground"
              >
                Resend code
              </button>
            </form>
            <Link
              href="/login"
              className="text-muted-foreground underline hover:text-foreground"
            >
              Wrong email?
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {error}
    </div>
  );
}
