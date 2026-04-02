"use client";

import { useEffect, useRef, useState } from "react";

// ---- Global: only one media element playing at a time ----
const activeMediaElements = new Set<HTMLMediaElement>();

function pauseAllMedia(except?: HTMLMediaElement) {
  activeMediaElements.forEach((el) => {
    if (el !== except) {
      try { el.pause(); } catch {}
    }
  });
}

// Global: only one YouTube iframe loaded at a time
let activeYouTubeDestroy: (() => void) | null = null;

/**
 * Unified video/audio player.
 * - YouTube: click-to-load (only one iframe at a time)
 * - MP4: HTML5 <video>
 * - Audio: HTML5 <audio>
 * All enforce single-player-at-a-time.
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
  const [ytActive, setYtActive] = useState(false);

  const start = Math.max(0, Math.floor(startSeconds));

  // HTML5 video: seek + single-player
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    activeMediaElements.add(el);

    const seek = () => {
      try {
        if (start > 0 && el.duration && start < el.duration) el.currentTime = start;
      } catch {}
    };
    const onPlay = () => {
      // Destroy any active YouTube iframe
      if (activeYouTubeDestroy) { activeYouTubeDestroy(); activeYouTubeDestroy = null; }
      pauseAllMedia(el);
    };

    el.addEventListener("loadedmetadata", seek);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("loadedmetadata", seek);
      el.removeEventListener("play", onPlay);
      activeMediaElements.delete(el);
    };
  }, [start, videoUrl]);

  // HTML5 audio: seek + single-player
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    activeMediaElements.add(el);

    const seek = () => {
      try {
        if (start > 0 && el.duration && start < el.duration) el.currentTime = start;
      } catch {}
    };
    const onPlay = () => {
      if (activeYouTubeDestroy) { activeYouTubeDestroy(); activeYouTubeDestroy = null; }
      pauseAllMedia(el);
    };

    el.addEventListener("loadedmetadata", seek);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("loadedmetadata", seek);
      el.removeEventListener("play", onPlay);
      activeMediaElements.delete(el);
    };
  }, [start, audioUrl]);

  // When this YouTube player activates, register its destroy callback
  useEffect(() => {
    if (!ytActive) return;
    // Kill previous YouTube + pause all HTML5 media
    if (activeYouTubeDestroy) activeYouTubeDestroy();
    pauseAllMedia();
    const destroy = () => setYtActive(false);
    activeYouTubeDestroy = destroy;
    return () => {
      if (activeYouTubeDestroy === destroy) activeYouTubeDestroy = null;
    };
  }, [ytActive]);

  // 1) YouTube — click thumbnail to load iframe (only one at a time)
  if (youtubeId) {
    if (!ytActive) {
      const thumbUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
      return (
        <div className="mt-3 w-full max-w-md cursor-pointer group" onClick={() => setYtActive(true)}>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <img
              src={thumbUrl}
              alt="Video thumbnail"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "0.5rem" }}
            />
            {/* Play button overlay */}
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: 68, height: 48, background: "rgba(0,0,0,0.7)", borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}
            className="group-hover:bg-red-600"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1">Click to play (starts at {formatTime(start)})</div>
        </div>
      );
    }

    return (
      <div className="mt-3 w-full max-w-md">
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
          <iframe
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, borderRadius: "0.5rem" }}
            src={`https://www.youtube.com/embed/${youtubeId}?start=${start}&autoplay=1`}
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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
