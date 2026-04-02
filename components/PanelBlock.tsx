"use client";

import Image from "next/image";
import ChunkCard from "@/components/ChunkCard";
import { PanelResult } from "@/lib/types";

/**
 * PanelBlock (Debug Version)
 * - Shows panel metadata (title/theme/date/speakers/photo)
 * - Normalizes chunks so ChunkCard gets predictable fields
 * - Adds rich debug output so we can SEE exactly what comes in
 */
export default function PanelBlock({
  panel,
  s3BaseUrl,
  audioPrefix,
  debug,
}: {
  panel: PanelResult;
  s3BaseUrl: string;
  audioPrefix: string;
  debug: boolean;
}) {
  const p: any = panel as any;

  // Panel meta can come from panel.panel_meta OR (rarely) flattened fields
  const meta: any = p?.panel_meta ?? undefined;

  const panelCode = String(p?.panel_code ?? "");
  const title = String(meta?.title ?? p?.title ?? "").trim() || "Untitled Panel";

  const theme = String(meta?.theme ?? "").trim();
  const organized_by = String(meta?.organized_by ?? "").trim();
  const panel_date = String(meta?.panel_date ?? "").trim();
  const speakersArr =
    Array.isArray(meta?.speakers) ? meta.speakers.map((x: any) => String(x).trim()).filter(Boolean) : [];

  const parts: string[] = [];
  if (panelCode) parts.push(`<div><b>Panel code:</b> ${panelCode}</div>`);
  if (theme) parts.push(`<div><b>Theme:</b> ${theme}</div>`);
  if (organized_by) parts.push(`<div><b>Organized by:</b> ${organized_by}</div>`);
  if (speakersArr.length) parts.push(`<div><b>Speakers:</b> ${speakersArr.join(", ")}</div>`);
  if (panel_date) parts.push(`<div><b>Date:</b> ${panel_date}</div>`);

  // Photo URL can be string or array or missing
  const photoUrlRaw = meta?.photo_url;
  const photoUrl =
    typeof photoUrlRaw === "string"
      ? photoUrlRaw.trim() || null
      : Array.isArray(photoUrlRaw)
      ? (photoUrlRaw.find((x) => typeof x === "string" && x.trim()) as string | undefined)?.trim() || null
      : null;

  // Chunks can be missing, undefined, etc.
  const rawChunks: any[] = Array.isArray(p?.chunks) ? (p.chunks as any[]) : [];

  // Normalize chunk fields aggressively so ChunkCard can render
  const chunks = rawChunks.map((c: any, idx: number) => {
    const text =
      (typeof c?.text === "string" && c.text) ||
      (typeof c?.chunk_text === "string" && c.chunk_text) ||
      (typeof c?.content === "string" && c.content) ||
      (typeof c?.body === "string" && c.body) ||
      "";

    const scoreRaw = c?._additional?.score;
    const score =
      typeof scoreRaw === "string" ? Number(scoreRaw) : typeof scoreRaw === "number" ? scoreRaw : undefined;

    const chunk_id = c?.chunk_id ?? c?.id ?? c?._additional?.id ?? `${panelCode || "panel"}-${idx}`;

    return {
      ...c,
      chunk_id,
      rank: c?.rank ?? idx + 1,
      text,
      chunk_text: c?.chunk_text ?? text,
      content: c?.content ?? text,
      _additional: {
        ...(c?._additional || {}),
        ...(score !== undefined ? { score } : {}),
      },
    };
  });

  const chunkCount = chunks.length;

  return (
    <>
      <hr className="panel-separator" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-[1.7rem] font-black text-[var(--cspc-blue-dark)]">{title}</div>

          {parts.length > 0 ? (
            <div
              className="mt-2 leading-[1.7]"
              dangerouslySetInnerHTML={{
                __html: `<div style="margin-top:10px;line-height:1.6;">${parts.join("")}</div>`,
              }}
            />
          ) : debug ? (
            <div className="mt-2 text-sm text-gray-600">No panel metadata returned for this result.</div>
          ) : null}

          {/* DEBUG: show meta keys + title fallback */}
          {debug ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">DEBUG: panel meta snapshot</div>
              <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-[260px]">
                {JSON.stringify(
                  {
                    panel_code: panelCode,
                    title_from_meta: meta?.title ?? null,
                    title_from_panel: p?.title ?? null,
                    meta_keys: meta ? Object.keys(meta) : null,
                    meta_preview: meta
                      ? {
                          title: meta?.title,
                          theme: meta?.theme,
                          organized_by: meta?.organized_by,
                          panel_date: meta?.panel_date,
                          speakers_len: Array.isArray(meta?.speakers) ? meta.speakers.length : null,
                          photo_url_type: Array.isArray(meta?.photo_url)
                            ? "array"
                            : typeof meta?.photo_url === "string"
                            ? "string"
                            : meta?.photo_url == null
                            ? "null"
                            : typeof meta?.photo_url,
                        }
                      : null,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          ) : null}
        </div>

        <div>
          {debug ? (
            <div className="text-xs text-gray-600 mb-2">
              DEBUG photo_url raw: {photoUrlRaw == null ? "null/undefined" : JSON.stringify(photoUrlRaw)}
              <br />
              DEBUG resolved photoUrl: {photoUrl ?? "null"}
            </div>
          ) : null}

          {photoUrl ? (
            <div className="panel-photo-container">
              <Image
                src={photoUrl}
                alt={panelCode ? `Panel ${panelCode}` : "Panel photo"}
                width={800}
                height={450}
                className="w-full h-auto rounded"
                unoptimized
              />
              {panelCode ? <div className="text-sm text-gray-700 mt-2">Panel {panelCode}</div> : null}
            </div>
          ) : debug ? (
            <div className="text-sm text-gray-600">No panel photo available</div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 text-[1.2rem] font-extrabold text-[var(--cspc-blue-dark)]">
        {chunkCount} relevant chunk{chunkCount === 1 ? "" : "s"} from this panel:
      </div>

      {/* DEBUG: show raw chunks count + first raw chunk + first normalized chunk */}
      {debug ? (
        <div className="mt-3">
          <div className="text-xs font-semibold text-gray-700 mb-2">DEBUG: chunks snapshot</div>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-[320px]">
            {JSON.stringify(
              {
                rawChunksCount: rawChunks.length,
                rawChunk0_keys: rawChunks[0] ? Object.keys(rawChunks[0]) : null,
                rawChunk0_preview: rawChunks[0]
                  ? {
                      chunk_id: rawChunks[0]?.chunk_id,
                      id: rawChunks[0]?.id,
                      rank: rawChunks[0]?.rank,
                      doc_id: rawChunks[0]?.doc_id,
                      panel_code: rawChunks[0]?.panel_code,
                      text: rawChunks[0]?.text,
                      chunk_text: rawChunks[0]?.chunk_text,
                      content: rawChunks[0]?.content,
                      start: rawChunks[0]?.chunk_start_time,
                      speakers: rawChunks[0]?.chunk_speakers,
                      score: rawChunks[0]?._additional?.score,
                    }
                  : null,
                normalizedChunk0_preview: chunks[0]
                  ? {
                      chunk_id: chunks[0]?.chunk_id,
                      rank: chunks[0]?.rank,
                      text_len: typeof chunks[0]?.text === "string" ? chunks[0].text.length : null,
                      text_head: typeof chunks[0]?.text === "string" ? chunks[0].text.slice(0, 120) : null,
                      start: chunks[0]?.chunk_start_time,
                      speakers: chunks[0]?.chunk_speakers,
                      score: chunks[0]?._additional?.score,
                    }
                  : null,
              },
              null,
              2
            )}
          </pre>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        {chunks.map((c: any, idx: number) => (
          <ChunkCard
            key={`${panelCode || "panel"}-${c?.chunk_id ?? c?.rank ?? idx}`}
            chunk={c}
            s3BaseUrl={s3BaseUrl}
            audioPrefix={audioPrefix}
          />
        ))}
      </div>
    </>
  );
}
