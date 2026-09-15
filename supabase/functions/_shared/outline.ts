// Outline API client (https://www.getoutline.com/developers). All endpoints are POST.

const OUTLINE_API = "https://app.getoutline.com/api";

async function outlineFetch(apiKey: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${OUTLINE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(`Outline API error (${path}): ${JSON.stringify(json)}`);
  }
  return json;
}

export async function testOutlineConnection(apiKey: string): Promise<boolean> {
  await outlineFetch(apiKey, "/auth.info", {});
  return true;
}

// Accepts either a document UUID or the id parsed out of a share URL like
// https://app.getoutline.com/doc/brand-voice-<id-suffix>.
function extractDocumentId(docUrlOrId: string): string {
  const trimmed = docUrlOrId.trim();
  const match = trimmed.match(/\/doc\/[a-z0-9-]*-([a-zA-Z0-9]{10,})$/i);
  if (match) return match[1];
  return trimmed;
}

export async function fetchOutlineDocumentText(apiKey: string, docUrlOrId: string): Promise<string> {
  const id = extractDocumentId(docUrlOrId);
  const json = await outlineFetch(apiKey, "/documents.info", { id });
  return json.data?.text ?? "";
}
