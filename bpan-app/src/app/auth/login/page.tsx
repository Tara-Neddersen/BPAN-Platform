"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next");
  const nextPath =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/operations";
  const callbackError = searchParams.get("error");
  const callbackErrorMessage = callbackError ? callbackError.replace(/\+/g, " ") : null;
  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasSupabaseEnv) {
      setError("Preview mode: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign in.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        router.push(nextPath);
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to Supabase. Check your URL/key and internet connection.";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="login">
      <div className="rounded-2xl border border-white/80 bg-white/84 p-5 shadow-[0_16px_30px_-20px_rgba(15,23,42,0.36)] backdrop-blur-xl sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-600">Continue to your LabLynx dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {!hasSupabaseEnv && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              UI preview mode is on. Supabase environment variables are not configured locally yet.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-slate-700">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 bg-slate-50/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 bg-slate-50/50"
            />
          </div>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          {!error && callbackErrorMessage && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {callbackErrorMessage}
            </p>
          )}
          <Button
            type="submit"
            className="h-11 w-full rounded-xl border border-primary/70 bg-primary text-white shadow-[0_14px_30px_-22px_color-mix(in_oklch,var(--primary)_70%,black)] hover:bg-primary/92"
            disabled={loading}
          >
            {loading ? "Signing in..." : hasSupabaseEnv ? "Sign in" : "Sign in (Preview only)"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="font-semibold text-primary hover:text-primary/90">
            Sign up
          </Link>
        </p>
        {!hasSupabaseEnv && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <Link
              href="/preview/dashboard"
              className="block rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Open dashboard preview (local only)
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
