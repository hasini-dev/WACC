// Server only. Page-level guard: send signed-out visitors to /login.
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import type { Me } from "@/types/api";

export async function requirePageMe(): Promise<Me> {
  const auth = await getMe();
  if ("me" in auth) return auth.me;
  redirect(auth.error === "not_member" ? "/login?error=not_member" : "/login");
}
