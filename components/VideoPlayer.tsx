"use client";

import { useEffect, useRef } from "react";

/**
 * Unified video/audio player.
 * - YouTube videos: iframe embed with ?start=
 * - MP4/direct URLs: HTML5 <video> with seek to startSeconds
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

  // Seek HTML5 video to startSeconds on load
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const seek = () => {
      try {
        if (Number.isFinite(start) && start > 0 && el.duration && start < el.duration) {
          el.currentTime = start;
        }
      } catch {}
    };
    el.addEventListener("loadedmetadata", seek);
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [start, videoUrl]);

  // Seek HTML5 audio to startSeconds on load
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const seek = () => {
      try {
        if (Number.isFinite(start) && start > 0 && el.duration && start < el.duration) {
          el.currentTime = start;
        }
      } catch {}
    };
    el.addEventListener("loadedmetadata", seek);
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [start, audioUrl]);

  // 1) YouTube embed
  if (youtubeId) {
    const src = `https://www.youtube.com/embed/${youtubeId}?start=${start}&rel=0`;
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

  // 2) Direct video URL (S3 mp4, etc.)
  if (videoUrl) {
    return (
      <div className="mt-3 w-full max-w-md rounded-lg overflow-hidden shadow">
        <video
          ref={videoRef}
          controls
          preload="none"
          src={videoUrl}
          className="w-full"
        />
      </div>
    );
  }

  // 3) Audio-only fallback
  if (audioUrl) {
    return (
      <div className="mt-3">
        <audio ref={audioRef} controls preload="none" src={audioUrl} className="w-full" />
      </div>
    );
  }

  return null;
}
