// List the resume bucket's folders and PDF counts (names and sizes only; no file contents).
// Usage: npm run bucket:inspect   (needs SUPABASE_SERVICE_ROLE_KEY in .env.local)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.RESUME_BUCKET || "resumes";
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function walk(prefix: string, out: Array<{ path: string; size: number }>) {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) await walk(full, out); // folder
      else out.push({ path: full, size: Number(item.metadata?.size ?? 0) });
    }
    if (data.length < 100) break;
  }
}

const files: Array<{ path: string; size: number }> = [];
await walk("", files);
const byFolder = new Map<string, typeof files>();
for (const f of files) {
  const folder = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "(root)";
  byFolder.set(folder, [...(byFolder.get(folder) ?? []), f]);
}
console.log(`bucket "${bucket}": ${files.length} files in ${byFolder.size} folders`);
for (const [folder, list] of byFolder) {
  const pdfs = list.filter((f) => f.path.toLowerCase().endsWith(".pdf")).length;
  console.log(`  ${folder}/  ${list.length} files (${pdfs} .pdf)`);
}
