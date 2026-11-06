/**
 * Serveur local de GENUS (Node.js) : sert l'API /api/… et, en production, la page web.
 * La logique est dans handlers.ts, partagée avec la version en ligne (Cloudflare Pages).
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { checkAccess, route, type Env } from "./handlers";

const PORT = Number(process.env.PORT ?? 8787);
const DIST = join(import.meta.dirname, "..", "dist");
const env = process.env as Env;

/** Convertit une requête Node en Request standard. */
function toRequest(req: IncomingMessage, signal: AbortSignal): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(`http://localhost${req.url ?? "/"}`, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error option Node nécessaire pour un corps en flux
    duplex: hasBody ? "half" : undefined,
    signal,
  });
}

/** Renvoie une Response standard au client Node, en flux. */
async function send(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return void res.end();
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) return void res.writeHead(403).end();
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  if (!existsSync(file)) return void res.writeHead(404).end("Lancez d'abord `npm run build`.");
  res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  const controller = new AbortController();
  res.on("close", () => controller.abort()); // le client a annulé (ex. nouvelle génération du CR)
  try {
    const request = toRequest(req, controller.signal);
    const denied = checkAccess(request, env);
    if (denied) return void (await send(res, denied));
    const response = await route(request, env);
    if (response) return void (await send(res, response));
    if (process.env.NODE_ENV === "production" && req.method === "GET") return serveStatic(req, res);
    res.writeHead(404).end();
  } catch (e) {
    if (controller.signal.aborted) return;
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erreur serveur");
  }
}).listen(PORT, () => {
  console.log(`GENUS API sur http://localhost:${PORT}`);
  console.log(`IA : ${env.ANTHROPIC_API_KEY ? `activée (${env.GENUS_MODEL || "claude-opus-5-5"})` : "désactivée (pas de clé : mode hors-ligne)"}`);
  console.log(`Accès : ${env.GENUS_PASSWORD ? "protégé par mot de passe" : "libre"}`);
});
