import { NextResponse } from "next/server";

/**
 * Add CORS headers for Chrome extension requests.
 */
export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function corsOptionsResponse() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
