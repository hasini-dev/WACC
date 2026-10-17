// Server only. Shared helpers for route handlers.
import { z } from "zod";
import { getMe } from "@/lib/auth";
import { RepoError } from "@/lib/repo";
import type { Me } from "@/types/api";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireMe(): Promise<Me> {
  const auth = await getMe();
  if ("me" in auth) return auth.me;
  throw new HttpError(auth.error === "signed_out" ? 401 : 403, auth.error === "signed_out" ? "Sign in required" : "Not a member of this organization");
}

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new HttpError(400, z.prettifyError(r.error));
  return r.data;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

/** Wrap a handler: typed errors → JSON responses; unknown errors → 500 without leaking details. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError || err instanceof RepoError) return Response.json({ error: err.message }, { status: err.status });
      console.error("[api]", (err as Error).name, (err as Error).message);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
