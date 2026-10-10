// stackhaus — zero-dependency static server (three.js + cannon-es via CDN).
const PORT = Number(process.env.PORT || 3028);
const root = new URL("../public/", import.meta.url).pathname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === "/") p = "/index.html";
    const file = Bun.file(root + p.replace(/^\/+/, ""));
    if (await file.exists()) {
      const ext = p.slice(p.lastIndexOf("."));
      return new Response(file, { headers: { "Content-Type": TYPES[ext] || "application/octet-stream" } });
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`stackhaus on http://127.0.0.1:${PORT}`);
