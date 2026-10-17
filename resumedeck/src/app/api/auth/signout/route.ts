import { supabaseServer } from "@/lib/supabase";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return Response.redirect(new URL("/login", req.url), 303);
}
