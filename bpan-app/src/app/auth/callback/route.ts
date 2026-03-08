import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function sanitizeNextPath(next: string | null) {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextPath = sanitizeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${nextPath}`);
    }
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("Sign in failed. Please try again.")}&next=${encodeURIComponent(nextPath)}`
    );
  }

  return NextResponse.redirect(
    `${origin}/auth/login?error=${encodeURIComponent("Could not complete sign in.")}&next=${encodeURIComponent(nextPath)}`
  );
}
