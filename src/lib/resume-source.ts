// Server/worker only. Where resume PDFs come from: the Supabase bucket, or a local folder.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export interface SourceFile {
  /** Path inside the source, e.g. "backend-engineer/jane_doe.pdf". The first folder is the job. */
  path: string;
  size: number;
  updatedAt: string | null;
}

export interface ResumeSource {
  readonly name: string;
  list(): Promise<SourceFile[]>;
  download(filePath: string): Promise<Uint8Array>;
}

/** First folder in the path names the job; files at the bucket root have no job. */
export function folderOf(filePath: string): string | null {
  const i = filePath.indexOf("/");
  return i > 0 ? filePath.slice(0, i) : null;
}

export class SupabaseBucketSource implements ResumeSource {
  readonly name: string;
  private readonly client;

  constructor(
    private readonly url: string,
    key: string,
    private readonly bucket: string,
    private readonly keyKind: "secret" | "publishable" = "secret",
  ) {
    this.name = `supabase://${bucket}`;
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async list(): Promise<SourceFile[]> {
    const out: SourceFile[] = [];
    const walk = async (prefix: string, depth: number) => {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await this.client.storage
          .from(this.bucket)
          .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`list ${prefix || "/"}: ${error.message}`);
        for (const item of data) {
          if (item.name === ".emptyFolderPlaceholder") continue;
          const full = prefix ? `${prefix}/${item.name}` : item.name;
          if (item.id === null) {
            if (depth < 3) await walk(full, depth + 1);
          } else {
            out.push({ path: full, size: Number(item.metadata?.size ?? 0), updatedAt: item.updated_at ?? item.created_at ?? null });
          }
        }
        if (data.length < 100) break;
      }
    };
    await walk("", 0);
    if (out.length === 0 && this.keyKind === "publishable") {
      // Storage returns [] (not an error) when RLS hides the objects from the anon role.
      throw new Error(
        `Listed 0 files in "${this.bucket}" with the publishable key. Storage hides objects from anonymous keys unless a SELECT policy allows it: set SUPABASE_SERVICE_ROLE_KEY, or add a storage policy (see README).`,
      );
    }
    return out;
  }

  async download(filePath: string): Promise<Uint8Array> {
    // Public bucket: plain public URL. Falls back to the authenticated API.
    const encoded = filePath.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${this.url}/storage/v1/object/public/${this.bucket}/${encoded}`, { signal: AbortSignal.timeout(60_000) });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    const { data, error } = await this.client.storage.from(this.bucket).download(filePath);
    if (error || !data) throw new Error(`download ${filePath}: ${error?.message ?? res.status}`);
    return new Uint8Array(await data.arrayBuffer());
  }
}

export class LocalFolderSource implements ResumeSource {
  readonly name: string;
  constructor(private readonly root: string) {
    this.name = `local://${path.relative(process.cwd(), root) || "."}`;
  }

  async list(): Promise<SourceFile[]> {
    const out: SourceFile[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(abs);
        else {
          const s = await stat(abs);
          out.push({ path: path.relative(this.root, abs).split(path.sep).join("/"), size: s.size, updatedAt: s.mtime.toISOString() });
        }
      }
    };
    await walk(this.root);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async download(filePath: string): Promise<Uint8Array> {
    const abs = path.resolve(this.root, filePath);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) throw new Error("path escapes source root");
    return new Uint8Array(await readFile(abs));
  }
}

/**
 * RESUME_SOURCE=local:<dir> reads a local folder (tests, offline demo).
 * Otherwise the Supabase bucket, listed with the secret key when available.
 */
export function resumeSourceFromEnv(env: NodeJS.ProcessEnv = process.env): ResumeSource {
  const spec = env.RESUME_SOURCE ?? "";
  if (spec.startsWith("local:")) return new LocalFolderSource(path.resolve(spec.slice("local:".length)));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const key = secret || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Set RESUME_SOURCE=local:<dir>, or NEXT_PUBLIC_SUPABASE_URL plus a Supabase key");
  return new SupabaseBucketSource(url, key, env.RESUME_BUCKET || "resumes", secret ? "secret" : "publishable");
}
