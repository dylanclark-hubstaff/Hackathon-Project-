// Avoma REST API client.
//
// VERIFY BEFORE LAUNCH: Avoma's API reference (https://dev.avoma.com) is a
// JS-rendered site we could not machine-verify field-by-field while building
// this. The shape below (base URL, auth header, /calls list + /meetings/{uuid}
// detail + /transcripts) matches Avoma's documented API concepts as of this
// writing, but confirm exact paths/params/fields against your own API key and
// the live reference before relying on it - Avoma issues user-scoped API keys
// from Settings > API, and the "test connection" button in Settings exercises
// this exact code path so you'll find out immediately if something's off.

const AVOMA_BASE_URL = "https://api.avoma.com/v1";

interface AvomaCall {
  uuid: string;
  subject?: string;
  start_at: string;
  url?: string;
  attendees?: { email?: string; name?: string }[];
  organizer_email?: string;
}

interface AvomaCallDetail extends AvomaCall {
  notes?: string; // Avoma AI notes/summary, HTML or markdown
  transcript_url?: string;
}

async function avomaFetch(apiKey: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${AVOMA_BASE_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Avoma API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function testAvomaConnection(apiKey: string): Promise<boolean> {
  await avomaFetch(apiKey, "/calls", { page_size: "1" });
  return true;
}

// Finds calls where the given contact email or company name appears among
// attendees/subject, within the trailing `daysBack` window.
export async function findAvomaCallsForAccount(
  apiKey: string,
  opts: { contactEmail?: string; companyName?: string; daysBack?: number }
): Promise<{ call: AvomaCall; detail: AvomaCallDetail }[]> {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - (opts.daysBack ?? 180) * 24 * 60 * 60 * 1000);

  const list = await avomaFetch(apiKey, "/calls", {
    from_date: fromDate.toISOString().slice(0, 10),
    to_date: toDate.toISOString().slice(0, 10),
    page_size: "50",
  });

  const calls: AvomaCall[] = list.results ?? list.calls ?? [];
  const needle = (opts.contactEmail || opts.companyName || "").toLowerCase();

  const matches = calls.filter((c) => {
    const haystack = [
      c.subject,
      c.organizer_email,
      ...(c.attendees ?? []).map((a) => `${a.name ?? ""} ${a.email ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();
    return needle && haystack.includes(needle);
  });

  const details = await Promise.all(
    matches.map(async (call) => {
      const detail: AvomaCallDetail = await avomaFetch(apiKey, `/meetings/${call.uuid}`);
      return { call, detail };
    })
  );

  return details;
}
