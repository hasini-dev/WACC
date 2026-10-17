// `npm run demo`: run the web app and the background worker together; Ctrl+C stops both.
import { spawn } from "node:child_process";

const procs = [
  ["web", "npx", ["next", "dev"]],
  ["worker", "npm", ["run", "worker"]],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const prefix = (chunk) =>
    String(chunk)
      .split("\n")
      .filter(Boolean)
      .map((l) => `[${name}] ${l}`)
      .join("\n") + "\n";
  p.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  p.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  p.on("exit", (code) => {
    console.log(`[${name}] exited with ${code}`);
    shutdown();
  });
  return p;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
