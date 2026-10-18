import { createClient } from "@supabase/supabase-js";
import { supabaseServer, supabaseUrl } from "@/lib/supabase";

/**
 * Demo only (DEMO_OPEN_SIGNUP=1): sign in by email without sending one, so Supabase's
 * built-in email rate limit doesn't block the demo. Mints a magic-link token with the
 * service-role key and verifies it straight away, which sets the session cookie.
 */
export async function POST(req: Request) {
  if (process.env.DEMO_OPEN_SIGNUP !== "1") return Response.json({ error: "not_found" }, { status: 404 });
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!secret) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Enter a valid email" }, { status: 400 });

  const admin = createClient(supabaseUrl(), secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    return Response.json({ error: error?.message ?? "Could not create a sign-in link" }, { status: 500 });
  }

  const supabase = await supabaseServer();
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (verifyError) return Response.json({ error: verifyError.message }, { status: 500 });
  return Response.json({ ok: true });
}