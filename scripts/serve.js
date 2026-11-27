// bun scripts/serve.js → serves demo/public on http://localhost:4173 (run `bun run build` first).
import { join, normalize } from "node:path";

const pub = join(import.meta.dir, "../demo/public");
const port = Number(process.env.PORT ?? 4173);

Bun.serve({
  port,
  async fetch(req) {
    let path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index.html";
    const file = Bun.file(join(pub, path));
    if (await file.exists()) return new Response(file);
    return new Response("not found", { status: 404 });
  },
});
console.log(`http://localhost:${port}`);
