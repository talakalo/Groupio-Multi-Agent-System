/** Normalized reads for escalation `context` (API/seed may omit agent-shaped fields). */

export type ActionTaken = { agent: string; action: string };

export function getEscalationActionsTaken(context: unknown): ActionTaken[] {
  if (!context || typeof context !== "object") return [];
  const raw = (context as { actionsTaken?: unknown }).actionsTaken;
  if (!Array.isArray(raw)) return [];
  const out: ActionTaken[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as { agent?: unknown; action?: unknown };
    if (typeof o.agent !== "string") continue;
    out.push({
      agent: o.agent,
      action: typeof o.action === "string" ? o.action : "",
    });
  }
  return out;
}

export function getEscalationIntent(context: unknown): string {
  if (!context || typeof context !== "object") return "";
  const i = (context as { intent?: unknown }).intent;
  return typeof i === "string" ? i : "";
}

export function getEscalationRagSummary(context: unknown): string | undefined {
  if (!context || typeof context !== "object") return undefined;
  const r = (context as { ragSummary?: unknown }).ragSummary;
  return typeof r === "string" ? r : undefined;
}
