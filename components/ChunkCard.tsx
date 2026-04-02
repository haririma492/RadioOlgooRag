"use client";

import YouTubePlayer from "@/components/YouTubePlayer";
import AudioPlayer from "@/components/AudioPlayer";
import { ChunkRow } from "@/lib/types";
import { audioUrlFromFileName, timeToSeconds } from "@/lib/utils";

/**
 * Extract a YouTube video ID from a video_code like "yt_dQw4w9WgXcQ"
 * or a full YouTube URL.
 */
function extractYouTubeId(videoCode?: string, videoUrl?: string): string | null {
  // Try video_code first (yt_XXXXXXXXXXX)
  if (videoCode?.startsWith("yt_")) {
    return videoCode.slice(3);
  }
  // Try video_url
  if (videoUrl) {
    const m = videoUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/
    );
    if (m) return m[1];
  }
  return null;
}

export default function ChunkCard({
  chunk,
  s3BaseUrl,
  audioPrefix,
  videoCode,
  videoUrl,
}: {
  chunk: ChunkRow;
  s3BaseUrl: string;
  audioPrefix: string;
  videoCode?: string;
  videoUrl?: string;
}) {
  const timeStr = chunk.chunk_start_time || "—";
  const spk = chunk.chunk_speakers || "—";
  const caps: string[] = [];
  if (timeStr !== "—") caps.push(`Time: ${timeStr}`);
  if (spk !== "—") caps.push(`Speakers: ${spk}`);

  const startSeconds = timeToSeconds(timeStr);
  const ytId = extractYouTubeId(videoCode || chunk.video_code, videoUrl);

  // Fallback to audio player for non-YouTube videos
  const fileName = chunk.file_name;
  const audioUrl = fileName ? audioUrlFromFileName(String(fileName), s3BaseUrl, audioPrefix) : null;

  return (
    <div className="chunk-root">
      <div className="font-semibold">Rank #{chunk.rank}</div>
      <div className="mt-2 whitespace-pre-wrap leading-relaxed">{chunk.text || "—"}</div>
      {caps.length > 0 && <div className="mt-2 text-sm text-gray-600">{caps.join(" • ")}</div>}

      {ytId ? (
        <YouTubePlayer videoId={ytId} startSeconds={startSeconds} />
      ) : audioUrl ? (
        <div className="mt-3">
          <AudioPlayer src={audioUrl} startSeconds={startSeconds} />
        </div>
      ) : null}
    </div>
  );
}
