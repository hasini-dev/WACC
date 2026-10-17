import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/** Magic-link landing: exchange the one-time code for a session cookie, then go to the dashboard. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next");
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return Response.redirect(new URL(dest, req.url), 303);
  }
  return Response.redirect(new URL("/login?error=link", req.url), 303);
}
