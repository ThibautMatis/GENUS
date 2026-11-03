import Anthropic from "@anthropic-ai/sdk";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { SYSTEM_PROMPT, userPrompt } from "../src/model/prompt";

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.GENUS_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.GENUS_EFFORT ?? "low") as "low" | "medium" | "high";
const DIST = join(import.meta.dirname, "..", "dist");

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Requête trop volumineuse");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handleReport(req: IncomingMessage, res: ServerResponse) {
  if (!client) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("ANTHROPIC_API_KEY non configurée : mode hors-ligne.");
    return;
  }
  let facts: unknown;
  let styleExample: string | undefined;
  try {
    ({ facts, styleExample } = JSON.parse(await readBody(req)));
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Requête invalide : ${(e as Error).message}`);
    return;
  }

  const controller = new AbortController();
  res.on("close", () => controller.abort()); // le client a annulé (nouvelle génération)

  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt(facts, styleExample) }],
        output_config: { effort: EFFORT },
        // Repli automatique sur un autre modèle si la requête est refusée par un filtre de sécurité
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal: controller.signal },
    );
    // En-têtes envoyés au premier événement : une erreur d'authentification remonte ainsi en 500
    const start = () => {
      if (!res.headersSent)
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
    };
    for await (const event of stream) {
      start();
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") res.write(event.delta.text);
    }
    const final = await stream.finalMessage();
    start();
    if (final.stop_reason === "refusal") res.write("\n\n[La génération a été interrompue par le modèle. Merci de rédiger cette partie manuellement.]");
    else if (final.stop_reason === "max_tokens") res.write("\n\n[Texte tronqué : longueur maximale atteinte.]");
    res.end();
  } catch (e) {
    if (controller.signal.aborted) return;
    console.error(e);
    const msg =
      e instanceof Anthropic.AuthenticationError
        ? "Clé API invalide"
        : e instanceof Anthropic.RateLimitError
          ? "Limite de débit atteinte, réessayez dans un instant"
          : e instanceof Anthropic.APIError
            ? `Erreur API (${e.status ?? "?"})`
            : "Erreur serveur";
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(msg);
    } else res.end(`\n\n[${msg}]`);
  }
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

createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/report") return void handleReport(req, res);
  if (req.method === "GET" && req.url === "/api/health")
    return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ai: !!client, model: MODEL }));
  if (process.env.NODE_ENV === "production" && req.method === "GET") return serveStatic(req, res);
  res.writeHead(404).end();
}).listen(PORT, () => {
  console.log(`GENUS API sur http://localhost:${PORT} – IA ${client ? `activée (${MODEL})` : "désactivée (pas de clé : mode hors-ligne)"}`);
});
