"use client";

/**
 * Embeds a YouTube video starting at a given timestamp.
 * Falls back to a "Watch on YouTube" link when the video ID is unavailable.
 */
export default function YouTubePlayer({
  videoId,
  startSeconds,
}: {
  videoId: string;
  startSeconds: number;
}) {
  if (!videoId) return null;

  const start = Math.max(0, Math.floor(startSeconds));
  const src = `https://www.youtube.com/embed/${videoId}?start=${start}&rel=0`;

  return (
    <div className="mt-3 aspect-video w-full max-w-md rounded-lg overflow-hidden shadow">
      <iframe
        src={src}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full border-0"
        loading="lazy"
      />
    </div>
  );
}
