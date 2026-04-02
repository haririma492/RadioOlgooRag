import { VideoRow } from "@/lib/types";
import { env, isDebug } from "./env";
import { getWeaviateClient } from "./weaviate";

type CacheEntry = { ts: number; rows: VideoRow[] };

declare global {
  // eslint-disable-next-line no-var
  var __videosCache: CacheEntry | undefined;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

function asStr(val: unknown): string {
  return val == null ? "" : String(val).trim();
}

function firstUrl(val: unknown): string | null {
  if (!val) return null;
  if (Array.isArray(val)) {
    for (const item of val) {
      if (typeof item === "string" && /^https?:\/\//.test(item.trim())) return item.trim();
    }
    return null;
  }
  if (typeof val === "string" && /^https?:\/\//.test(val.trim())) return val.trim();
  return null;
}

export async function fetchAllPanelsRows(): Promise<VideoRow[]> {
  const now = Date.now();
  const cached = globalThis.__videosCache;
  if (cached && now - cached.ts < TTL_MS) return cached.rows;

  const client = getWeaviateClient();
  const collName = env.WEAVIATE_PANELS_COLLECTION; // Olgoo_Videos

  const returnProps = [
    "video_code", "title", "category", "speakers",
    "video_date", "video_url", "external_details_url",
    "photo_url", "summary", "year",
  ];

  const gql = await client.graphql.get()
    .withClassName(collName)
    .withFields(returnProps.join(" "))
    .withLimit(2000)
    .do();

  const objects: any[] = gql?.data?.Get?.[collName] ?? [];
  const rows: VideoRow[] = [];

  for (const p of objects) {
    if (!p) continue;

    let year = asStr(p.year);
    if (/^\d+$/.test(year)) year = String(parseInt(year, 10));

    const row: VideoRow = {
      video_code: asStr(p.video_code),
      title: asStr(p.title),
      category: asStr(p.category),
      speakers: Array.isArray(p.speakers) ? p.speakers.map((s: any) => asStr(s)).filter(Boolean) : typeof p.speakers === "string" ? [p.speakers.trim()].filter(Boolean) : [],
      video_date: asStr(p.video_date),
      video_url: asStr(p.video_url),
      external_details_url: asStr(p.external_details_url),
      year,
      photo_url: firstUrl(p.photo_url),
      summary: asStr(p.summary),
    };
    rows.push(row);
  }

  // Dedupe by video_code
  const best = new Map<string, VideoRow>();
  for (const r of rows) {
    if (!r.video_code) continue;
    if (!best.has(r.video_code)) best.set(r.video_code, r);
  }

  const result = Array.from(best.values());

  if (isDebug) {
    console.log(`[Olgoo] Loaded ${result.length} videos from Weaviate`);
  }

  globalThis.__videosCache = { ts: now, rows: result };
  return result;
}

export async function getVideosMap(): Promise<Map<string, VideoRow>> {
  const rows = await fetchAllPanelsRows();
  const m = new Map<string, VideoRow>();
  for (const r of rows) {
    m.set(r.video_code, r);
  }
  return m;
}
