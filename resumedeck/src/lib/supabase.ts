import { createBrowserClient, createServerClient } from "@supabase/ssr";

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

/** Publishable (anon) key; safe in the browser. Accepts the legacy env name too. */
export function supabasePublishableKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export function authConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublishableKey());
}

export function supabaseBrowser() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}

/** Server client bound to the request's cookies (route handlers and server components). */
export async function supabaseServer() {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only; a route handler refreshes them.
        }
      },
    },
  });
}
