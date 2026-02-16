import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

/**
 * Extension login endpoint.
 * Takes email/password, returns a Supabase access token.
 */
export async function OPTIONS() {
  return corsOptionsResponse();
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { error: error?.message || "Login failed" },
        { status: 401, headers: corsHeaders() }
      );
    }

    return NextResponse.json(
      {
        token: data.session.access_token,
        user: data.user.email,
      },
      { headers: corsHeaders() }
    );
  } catch (err) {
    console.error("Extension login error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
