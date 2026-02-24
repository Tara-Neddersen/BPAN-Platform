"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
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
        router.push("/dashboard");
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
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_20px_-16px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-600">Continue to your BPAN dashboard</p>
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
          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-[linear-gradient(135deg,#5aa5bb,#3d8397)] text-white shadow-[0_10px_20px_-12px_rgba(45,110,128,0.8)] hover:opacity-95"
            disabled={loading}
          >
            {loading ? "Signing in..." : hasSupabaseEnv ? "Sign in" : "Sign in (Preview only)"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="font-semibold text-cyan-700 hover:text-cyan-800">
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
