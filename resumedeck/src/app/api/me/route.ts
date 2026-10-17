import { getMe } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getMe();
  if ("me" in auth) return Response.json({ me: auth.me });
  return Response.json({ error: auth.error, email: auth.email ?? null }, { status: auth.error === "signed_out" ? 401 : 403 });
}
