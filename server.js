import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 4026);
const host = "0.0.0.0";
const distDir = join(process.cwd(), "dist");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8"
};

function sendFile(response, filePath) {
  const extension = extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] ?? "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
}

createServer((request, response) => {
  const requestPath = request.url?.split("?")[0] ?? "/";
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(distDir, safePath === "/" ? "index.html" : safePath);

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(response, filePath);
    return;
  }

  const indexPath = join(distDir, "index.html");
  if (existsSync(indexPath)) {
    sendFile(response, indexPath);
    return;
  }

  response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Brak zbudowanej aplikacji. Uruchom najpierw npm run build.");
}).listen(port, host, () => {
  console.log(`FutStat server running on http://${host}:${port}`);
});
