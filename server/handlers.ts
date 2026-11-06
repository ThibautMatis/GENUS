/**
 * Logique serveur de GENUS, écrite avec les objets standard du web (Request / Response)
 * pour tourner à l'identique :
 *  - en local (server/index.ts, Node.js),
 *  - en ligne sur Cloudflare Pages (dossier functions/).
 */
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, userPrompt } from "../src/model/prompt";

export interface Env {
  ANTHROPIC_API_KEY?: string;
  GENUS_MODEL?: string;
  GENUS_EFFORT?: string;
  /** Mot de passe d'accès au site (si vide : site non protégé) */
  GENUS_PASSWORD?: string;
  CANRISK_URL?: string;
  CANRISK_TOKEN?: string;
  CANRISK_USERNAME?: string;
  CANRISK_PASSWORD?: string;
  CANRISK_CANCER_RATES?: string;
  CANRISK_USER_ID?: string;
}

/** Signature d'une fonction Cloudflare Pages (évite de dépendre des types Cloudflare). */
export type PagesFunction = (context: { request: Request; env: Env; next: () => Promise<Response> }) => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

const modelOf = (env: Env) => env.GENUS_MODEL || "claude-opus-5-5";
const canriskUrl = (env: Env) => (env.CANRISK_URL || "https://www.canrisk.org").replace(/\/$/, "");
const canriskConfigured = (env: Env) => !!(env.CANRISK_TOKEN || (env.CANRISK_USERNAME && env.CANRISK_PASSWORD));

/* ---------- Protection du site par mot de passe ---------- */

/** Renvoie une réponse 401 si le site est protégé et que le mot de passe fourni est absent ou faux. */
export function checkAccess(request: Request, env: Env): Response | null {
  const expected = env.GENUS_PASSWORD;
  if (!expected) return null;
  const header = request.headers.get("Authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(password, expected)) return null;
    } catch {
      /* en-tête invalide */
    }
  }
  return new Response("Accès réservé : mot de passe GENUS requis.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="GENUS", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ---------- État du serveur ---------- */

export function handleHealth(env: Env): Response {
  return json(200, { ai: !!env.ANTHROPIC_API_KEY, model: modelOf(env), canrisk: canriskConfigured(env) });
}

/* ---------- Rédaction du CR par Claude ---------- */

export async function handleReport(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return text(503, "ANTHROPIC_API_KEY non configurée : mode hors-ligne.");
  let facts: unknown;
  let styleExample: string | undefined;
  try {
    ({ facts, styleExample } = (await request.json()) as { facts: unknown; styleExample?: string });
  } catch (e) {
    return text(400, `Requête invalide : ${(e as Error).message}`);
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const stream = client.beta.messages.stream(
    {
      model: modelOf(env),
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(facts, styleExample) }],
      output_config: { effort: (env.GENUS_EFFORT || "low") as "low" | "medium" | "high" },
      // Repli automatique sur un autre modèle si la requête est refusée par un filtre de sécurité
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal: request.signal },
  );

  const errorMessage = (e: unknown) =>
    e instanceof Anthropic.AuthenticationError
      ? "Clé API invalide"
      : e instanceof Anthropic.RateLimitError
        ? "Limite de débit atteinte, réessayez dans un instant"
        : e instanceof Anthropic.APIError
          ? `Erreur API (${e.status ?? "?"})`
          : "Erreur serveur";

  // On attend le premier événement avant de répondre : une erreur (clé invalide…) remonte ainsi en 500
  const iterator = stream[Symbol.asyncIterator]();
  let first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
  try {
    first = await iterator.next();
  } catch (e) {
    console.error(e);
    return text(500, errorMessage(e));
  }

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: Anthropic.Beta.Messages.BetaRawMessageStreamEvent) => {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") controller.enqueue(enc.encode(ev.delta.text));
      };
      try {
        if (!first.done) emit(first.value);
        for (let r = await iterator.next(); !r.done; r = await iterator.next()) emit(r.value);
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal")
          controller.enqueue(enc.encode("\n\n[La génération a été interrompue par le modèle. Merci de rédiger cette partie manuellement.]"));
        else if (final.stop_reason === "max_tokens") controller.enqueue(enc.encode("\n\n[Texte tronqué : longueur maximale atteinte.]"));
      } catch (e) {
        if (!request.signal.aborted) controller.enqueue(enc.encode(`\n\n[${errorMessage(e)}]`));
      }
      controller.close();
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
}

/* ---------- CanRisk ---------- */

let serverToken = "";

/** Jeton du compte CanRisk configuré sur le serveur (optionnel). */
async function serverCanRiskToken(env: Env): Promise<string> {
  if (env.CANRISK_TOKEN) return env.CANRISK_TOKEN;
  if (serverToken) return serverToken;
  const r = await fetch(`${canriskUrl(env)}/auth-token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: env.CANRISK_USERNAME, password: env.CANRISK_PASSWORD }),
  });
  const data = (await r.json().catch(() => ({}))) as { token?: string };
  if (!r.ok || !data.token) throw new Error(`Authentification CanRisk refusée (${r.status}).`);
  serverToken = data.token;
  return serverToken;
}

/** Connexion : échange identifiant + mot de passe CanRisk contre un jeton. Le mot de passe n'est ni stocké ni journalisé. */
export async function handleCanRiskLogin(request: Request, env: Env): Promise<Response> {
  let username = "";
  let password = "";
  try {
    ({ username, password } = (await request.json()) as { username: string; password: string });
  } catch {
    return json(400, { detail: "Requête invalide" });
  }
  if (!username || !password) return json(400, { detail: "Identifiant et mot de passe requis." });
  try {
    const r = await fetch(`${canriskUrl(env)}/auth-token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = (await r.json().catch(() => ({}))) as { token?: string };
    if (!r.ok || !data.token) return json(401, { detail: "Identifiant ou mot de passe CanRisk incorrect." });
    return json(200, { token: data.token });
  } catch (e) {
    return json(502, { detail: `Service CanRisk injoignable : ${(e as Error).message}` });
  }
}

export async function handleCanRisk(request: Request, env: Env): Promise<Response> {
  // Jeton de l'utilisateur connecté (envoyé par le navigateur), sinon compte configuré sur le serveur
  const userToken = request.headers.get("X-CanRisk-Token") ?? "";
  if (!userToken && !canriskConfigured(env))
    return json(401, { detail: "Connectez-vous à CanRisk (identifiant et mot de passe de votre compte canrisk.org)." });

  let input: { model?: string; pedigree_data?: string; mut_freq?: string; cancer_rates?: string };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return json(400, { detail: "Requête invalide" });
  }
  const model = input.model;
  if (!model || !["boadicea", "ovarian", "prostate"].includes(model)) return json(400, { detail: "Modèle inconnu" });
  if (!input.pedigree_data) return json(400, { detail: "Arbre manquant" });

  const body = {
    mut_freq: input.mut_freq ?? "UK",
    cancer_rates: input.cancer_rates ?? env.CANRISK_CANCER_RATES ?? "UK",
    pedigree_data: input.pedigree_data,
    user_id: env.CANRISK_USER_ID ?? "genus",
  };
  try {
    const call = async () =>
      fetch(`${canriskUrl(env)}/${model}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Token ${userToken || (await serverCanRiskToken(env))}`,
        },
        body: JSON.stringify(body),
      });
    let r = await call();
    // Jeton du serveur expiré : on en redemande un
    if ((r.status === 401 || r.status === 403) && !userToken && !env.CANRISK_TOKEN && env.CANRISK_USERNAME) {
      serverToken = "";
      r = await call();
    }
    const raw = await r.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { detail: raw.slice(0, 500) };
    }
    if (r.status === 401 || r.status === 403)
      return json(r.status, {
        detail: `CanRisk a refusé l'accès (${(data as { detail?: string }).detail ?? r.status}). Reconnectez-vous ; si le problème persiste, vérifiez auprès de CanRisk que votre compte a accès aux web-services.`,
        expired: !!userToken,
      });
    return json(r.status, data);
  } catch (e) {
    console.error(e);
    return json(502, { detail: `Service CanRisk injoignable : ${(e as Error).message}` });
  }
}

/** Aiguillage des routes /api/… (utilisé par le serveur local). */
export async function route(request: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (request.method === "GET" && pathname === "/api/health") return handleHealth(env);
  if (request.method === "POST" && pathname === "/api/report") return handleReport(request, env);
  if (request.method === "POST" && pathname === "/api/canrisk") return handleCanRisk(request, env);
  if (request.method === "POST" && pathname === "/api/canrisk/login") return handleCanRiskLogin(request, env);
  return null;
}
