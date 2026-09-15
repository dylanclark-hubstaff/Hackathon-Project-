// Anthropic Messages API client used for: sequence generation, single-email
// regeneration, and voice-profile summarization.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  const text = body.content?.map((b: { text?: string }) => b.text ?? "").join("") ?? "";
  return text;
}

// Extracts the first JSON object/array in a model response, tolerating a
// ```json fenced block or stray leading/trailing prose.
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  const jsonSlice = start >= 0 && end >= start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonSlice) as T;
}
