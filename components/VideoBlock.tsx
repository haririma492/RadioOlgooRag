"use client";

import ChunkCard from "@/components/ChunkCard";
import { VideoResult } from "@/lib/types";

export default function VideoBlock({
  panel,
  s3BaseUrl,
  audioPrefix,
  debug,
}: {
  panel: VideoResult;
  s3BaseUrl: string;
  audioPrefix: string;
  debug: boolean;
}) {
  const p: any = panel as any;

  // Video meta can come from video_meta or flattened fields
  const meta: any = p?.video_meta ?? undefined;

  const videoCode = String(p?.video_code ?? "");
  const title = String(meta?.title ?? p?.title ?? "").trim() || "Untitled Video";
  const category = String(meta?.category ?? "").trim();
  const speakersArr = Array.isArray(meta?.speakers) ? meta.speakers : typeof meta?.speakers === "string" ? [meta.speakers] : [];
  const speakers = speakersArr.filter(Boolean).join(", ");
  const videoDate = String(meta?.video_date ?? "").trim();
  const videoUrl = String(meta?.video_url ?? "").trim();
  const summary = String(meta?.summary ?? "").trim();

  const parts: string[] = [];
  if (speakers) parts.push(`<div><b>Speaker:</b> ${speakers}</div>`);
  if (videoDate) parts.push(`<div><b>Date:</b> ${videoDate}</div>`);
  if (category) parts.push(`<div><b>Category:</b> ${category}</div>`);

  // Photo URL
  const photoUrlRaw = meta?.photo_url;
  const photoUrl =
    typeof photoUrlRaw === "string"
      ? photoUrlRaw.trim() || null
      : null;

  const rawChunks: any[] = Array.isArray(p?.chunks) ? (p.chunks as any[]) : [];

  const chunks = rawChunks.map((c: any, idx: number) => {
    const text =
      (typeof c?.text === "string" && c.text) ||
      (typeof c?.chunk_text === "string" && c.chunk_text) ||
      "";

    const scoreRaw = c?._additional?.score;
    const score =
      typeof scoreRaw === "string" ? Number(scoreRaw) : typeof scoreRaw === "number" ? scoreRaw : undefined;

    const chunk_id = c?.chunk_id ?? `${videoCode || "video"}-${idx}`;

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

      <div className="mb-4">
        <div className="text-[1.7rem] font-black text-[var(--cspc-blue-dark)]">{title}</div>

        {parts.length > 0 && (
          <div
            className="mt-2 leading-[1.7]"
            dangerouslySetInnerHTML={{
              __html: `<div style="margin-top:10px;line-height:1.6;">${parts.join("")}</div>`,
            }}
          />
        )}

        {summary && (
          <div className="mt-2 text-gray-600 text-sm italic">{summary.slice(0, 200)}</div>
        )}

        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-blue-600 hover:underline text-sm"
          >
            Watch original video
          </a>
        )}
      </div>

      <div className="mt-4 text-[1.2rem] font-extrabold text-[var(--cspc-blue-dark)]">
        {chunkCount} relevant chunk{chunkCount === 1 ? "" : "s"} from this video:
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        {chunks.map((c: any, idx: number) => (
          <ChunkCard
            key={`${videoCode || "video"}-${c?.chunk_id ?? c?.rank ?? idx}`}
            chunk={c}
            s3BaseUrl={s3BaseUrl}
            audioPrefix={audioPrefix}
          />
        ))}
      </div>
    </>
  );
}
