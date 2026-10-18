// Apply supabase/migrations/*.sql in order, recording each in public._migrations.
// Usage: npm run db:migrate   (needs DATABASE_URL in .env.local)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local, or paste the files in supabase/migrations/ into the SQL Editor.");
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())");
  const { rows } = await client.query<{ name: string }>("select name from public._migrations");
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`apply ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${file}: ${(err as Error).message}`);
    }
  }
} finally {
  await client.end();
}
