"use client";

import AudioPlayer from "@/components/AudioPlayer";
import { ChunkRow } from "@/lib/types";
import { audioUrlFromFileName, timeToSeconds } from "@/lib/utils";

export default function ChunkCard({
  chunk,
  s3BaseUrl,
  audioPrefix,
}: {
  chunk: ChunkRow;
  s3BaseUrl: string;
  audioPrefix: string;
}) {
  const timeStr = chunk.chunk_start_time || "—";
  const spk = chunk.chunk_speakers || "—";
  const caps: string[] = [];
  if (timeStr !== "—") caps.push(`Time: ${timeStr}`);
  if (spk !== "—") caps.push(`Speakers: ${spk}`);

  const fileName = chunk.file_name;
  const audioUrl = fileName ? audioUrlFromFileName(String(fileName), s3BaseUrl, audioPrefix) : null;
  const startSeconds = timeToSeconds(timeStr);

  return (
    <div className="chunk-root">
      <div className="font-semibold">Rank #{chunk.rank}</div>
      <div className="mt-2 whitespace-pre-wrap leading-relaxed">{chunk.text || "—"}</div>
      {caps.length > 0 && <div className="mt-2 text-sm text-gray-600">{caps.join(" • ")}</div>}
      {audioUrl && (
        <div className="mt-3">
          <AudioPlayer src={audioUrl} startSeconds={startSeconds} />
        </div>
      )}
    </div>
  );
}
