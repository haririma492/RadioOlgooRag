"use client";

import VideoPlayer from "@/components/VideoPlayer";
import { ChunkRow } from "@/lib/types";
import { audioUrlFromFileName, timeToSeconds } from "@/lib/utils";

/**
 * Extract a YouTube video ID from a video_code like "yt_dQw4w9WgXcQ"
 * or a full YouTube URL.
 */
function extractYouTubeId(videoCode?: string, videoUrl?: string): string | null {
  if (videoCode?.startsWith("yt_")) {
    return videoCode.slice(3);
  }
  if (videoUrl) {
    const m = videoUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/
    );
    if (m) return m[1];
  }
  return null;
}

/**
 * Check if a URL points to a playable video file (mp4, webm, etc.)
 */
function isDirectVideoUrl(url?: string): boolean {
  if (!url) return false;
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}

export default function ChunkCard({
  chunk,
  s3BaseUrl,
  audioPrefix,
  videoCode,
  videoUrl,
  videoTitle,
  videoSpeakers,
}: {
  chunk: ChunkRow;
  s3BaseUrl: string;
  audioPrefix: string;
  videoCode?: string;
  videoUrl?: string;
  videoTitle?: string;
  videoSpeakers?: string;
}) {
  const timeStr = chunk.chunk_start_time || "—";
  const spk = chunk.chunk_speakers || "—";
  const caps: string[] = [];
  if (timeStr !== "—") caps.push(`Time: ${timeStr}`);
  if (spk !== "—") caps.push(`Speakers: ${spk}`);

  const startSeconds = timeToSeconds(timeStr);
  const ytId = extractYouTubeId(videoCode || chunk.video_code, videoUrl);
  const directVideo = !ytId && isDirectVideoUrl(videoUrl) ? videoUrl : null;

  // Always compute an audio URL when we have a file name — it powers both the
  // audio fallback AND the "Listen in background" mode that lives alongside
  // the YouTube/video player on mobile.
  const fileName = chunk.file_name;
  const audioUrl = fileName ? audioUrlFromFileName(String(fileName), s3BaseUrl, audioPrefix) : null;

  return (
    <div className="chunk-root">
      <div className="font-semibold">Rank #{chunk.rank}</div>
      <div className="mt-2 whitespace-pre-wrap leading-relaxed">{chunk.text || "—"}</div>
      {caps.length > 0 && <div className="mt-2 text-sm text-gray-600">{caps.join(" • ")}</div>}

      <VideoPlayer
        youtubeId={ytId}
        videoUrl={directVideo}
        audioUrl={audioUrl}
        startSeconds={startSeconds}
        mediaTitle={videoTitle}
        mediaArtist={videoSpeakers || (spk !== "—" ? spk : undefined)}
      />
    </div>
  );
}
