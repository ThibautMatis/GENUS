import Anthropic from "@anthropic-ai/sdk";
import type { ReportFacts } from "./model/facts";
import { SYSTEM_PROMPT, userPrompt } from "./model/prompt";

export const MODEL = "claude-opus-5-5";

/** Erreur signalant qu'aucune IA n'est disponible (pas de clé, pas de serveur) : on passe en mode hors-ligne. */
export class NoAIError extends Error {}

const KEY_STORAGE = "genus.apiKey";

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* stockage indisponible */
  }
}

/**
 * Rédige le CR en streaming. Deux modes :
 * - clé API saisie dans le navigateur (site statique type GitHub Pages) : appel direct à l'API Claude ;
 * - sinon, serveur local GENUS (/api/report) qui détient la clé dans .env.
 */
export async function* streamReport(facts: ReportFacts, styleExample: string, signal: AbortSignal): AsyncGenerator<string> {
  const key = getApiKey();
  if (key) {
    yield* streamDirect(key, facts, styleExample, signal);
    return;
  }
  let res: Response;
  try {
    res = await fetch("api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts, styleExample }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new NoAIError();
  }
  // Site statique (GitHub Pages) ou serveur sans clé : pas d'IA disponible
  if ([404, 405, 501, 502, 503].includes(res.status) || res.headers.get("content-type")?.includes("text/html")) throw new NoAIError();
  if (!res.ok || !res.body) throw new Error((await res.text()) || `Erreur ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    yield dec.decode(value, { stream: true });
  }
}

async function* streamDirect(apiKey: string, facts: ReportFacts, styleExample: string, signal: AbortSignal): AsyncGenerator<string> {
  // Prototype uniquement : la clé reste dans ce navigateur et part directement chez Anthropic.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt(facts, styleExample) }],
        output_config: { effort: "low" },
        // Repli automatique sur un autre modèle si la requête est refusée par un filtre de sécurité
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\n[La génération a été interrompue par le modèle. Merci de rédiger cette partie manuellement.]";
    else if (final.stop_reason === "max_tokens") yield "\n\n[Texte tronqué : longueur maximale atteinte.]";
  } catch (e) {
    if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (e instanceof Anthropic.AuthenticationError) throw new Error("clé API invalide");
    if (e instanceof Anthropic.RateLimitError) throw new Error("limite de débit atteinte, réessayez dans un instant");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("API Claude injoignable (réseau ou pare-feu ?)");
    if (e instanceof Anthropic.APIError) throw new Error(`erreur API ${e.status ?? ""}`);
    throw e;
  }
}
