"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const hasSupabaseEnv = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasSupabaseEnv) {
      setError("Preview mode: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable sign up.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split("@")[0],
          },
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        setSuccess(true);
        setLoading(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to Supabase. Check your URL/key and internet connection.";
      setError(message);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell mode="signup">
        <div className="rounded-xl border border-slate-200/80 bg-white p-6 text-center shadow-[0_10px_20px_-16px_rgba(15,23,42,0.35)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Check your email</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Activate your account, then return to sign in.
          </p>
          <Button
            className="mt-5 h-11 w-full rounded-xl border-slate-200"
            variant="outline"
            onClick={() => router.push("/auth/login")}
          >
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="signup">
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_20px_-16px_rgba(15,23,42,0.35)] sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-900">Create account</h2>
          <p className="mt-1 text-sm text-slate-600">Get started with the BPAN platform</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          {!hasSupabaseEnv && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              UI preview mode is on. Supabase environment variables are not configured locally yet.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="displayName" className="text-sm font-medium text-slate-700">Display name</Label>
            <Input
              id="displayName"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-11 rounded-xl border-slate-200 bg-slate-50/50"
            />
          </div>
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
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
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
            {loading ? "Creating account..." : hasSupabaseEnv ? "Sign up" : "Sign up (Preview only)"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-semibold text-cyan-700 hover:text-cyan-800">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
