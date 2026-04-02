"use client";

import { useEffect, useRef } from "react";

/**
 * Unified video/audio player.
 * - YouTube videos: simple iframe embed
 * - MP4/direct URLs: HTML5 <video> with seek
 * - Audio-only fallback: HTML5 <audio>
 */
export default function VideoPlayer({
  youtubeId,
  videoUrl,
  audioUrl,
  startSeconds,
}: {
  youtubeId?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  startSeconds: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const start = Math.max(0, Math.floor(startSeconds));

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const seek = () => {
      try {
        if (start > 0 && el.duration && start < el.duration) {
          el.currentTime = start;
        }
      } catch {}
    };
    el.addEventListener("loadedmetadata", seek);
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [start, videoUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const seek = () => {
      try {
        if (start > 0 && el.duration && start < el.duration) {
          el.currentTime = start;
        }
      } catch {}
    };
    el.addEventListener("loadedmetadata", seek);
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [start, audioUrl]);

  // 1) YouTube — plain iframe, most compatible approach
  if (youtubeId) {
    return (
      <div className="mt-3 w-full max-w-md">
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
          <iframe
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, borderRadius: "0.5rem" }}
            src={`https://www.youtube.com/embed/${youtubeId}?start=${start}`}
            title="Video"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // 2) Direct video URL (S3 mp4)
  if (videoUrl) {
    return (
      <div className="mt-3 w-full max-w-md rounded-lg overflow-hidden shadow">
        <video ref={videoRef} controls preload="none" src={videoUrl} className="w-full" />
      </div>
    );
  }

  // 3) Audio fallback
  if (audioUrl) {
    return (
      <div className="mt-3">
        <audio ref={audioRef} controls preload="none" src={audioUrl} className="w-full" />
      </div>
    );
  }

  return null;
}
