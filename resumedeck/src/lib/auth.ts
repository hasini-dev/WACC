// Server only. Who is calling, and which org are they in?
import { addMember, ensureOrg, hasMemberEmail, memberForUser } from "@/lib/repo";
import { authConfigured, supabaseServer } from "@/lib/supabase";
import type { Me } from "@/types/api";

let seeded = false;

/** Create the org and the seed recruiter (an admin) the first time anything asks. */
export function ensureSeed(): string {
  const orgId = ensureOrg(process.env.COMPANY_NAME || "Brightline Payroll");
  if (!seeded) {
    const email = process.env.SEED_RECRUITER_EMAIL?.trim().toLowerCase();
    if (email && !hasMemberEmail(orgId, email)) addMember(orgId, `pending:${email}`, email, "admin");
    seeded = true;
  }
  return orgId;
}

/**
 * Tests and offline demos can skip email sign-in with AUTH_BYPASS_EMAIL, but only
 * when ALLOW_AUTH_BYPASS=1 is also set, so a stray variable can't open production.
 */
function bypassEmail(): string | null {
  const email = process.env.AUTH_BYPASS_EMAIL;
  return email && process.env.ALLOW_AUTH_BYPASS === "1" ? email.toLowerCase() : null;
}

export type AuthResult = { me: Me } | { error: "signed_out" | "not_member"; email?: string };

export async function getMe(): Promise<AuthResult> {
  const orgId = ensureSeed();
  const bypass = bypassEmail();
  if (bypass) {
    let me = memberForUser(`dev:${bypass}`, bypass);
    if (!me) {
      addMember(orgId, `dev:${bypass}`, bypass, "admin");
      me = memberForUser(`dev:${bypass}`, bypass);
    }
    return me ? { me } : { error: "not_member", email: bypass };
  }
  if (!authConfigured()) return { error: "signed_out" };
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return { error: "signed_out" };
  const me = memberForUser(user.id, user.email);
  return me ? { me } : { error: "not_member", email: user.email };
}
