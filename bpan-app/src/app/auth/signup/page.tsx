"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
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
    setLoading(true);

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
  }

  if (success) {
    return (
      <div className="auth-gradient min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold shadow-lg shadow-primary/25">
              B
            </div>
          </div>
          <Card className="shadow-xl shadow-black/[0.04] border-border/60">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <CardTitle className="text-xl font-semibold">Check your email</CardTitle>
              <CardDescription>
                We&apos;ve sent a confirmation link to <strong>{email}</strong>.
                Click the link to activate your account, then come back and sign in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full h-10 rounded-lg"
                variant="outline"
                onClick={() => router.push("/auth/login")}
              >
                Back to sign in
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-gradient min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo & Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold shadow-lg shadow-primary/25">
            B
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            BPAN <span className="font-light text-muted-foreground">Platform</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-powered research assistant
          </p>
        </div>

        <Card className="shadow-xl shadow-black/[0.04] border-border/60">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl font-semibold">Create an account</CardTitle>
            <CardDescription>Get started with the BPAN Research Platform</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-sm font-medium">Display name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-10 rounded-lg"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
              )}
              <Button type="submit" className="w-full h-10 rounded-lg shadow-sm shadow-primary/25" disabled={loading}>
                {loading ? "Creating account..." : "Sign up"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-primary font-medium hover:text-primary/80 transition-colors">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
