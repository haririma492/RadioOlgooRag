"use client";

import { useEffect, useRef, useCallback } from "react";

// ---- Global registry: only one player at a time ----
const activePlayers = new Set<{ pause: () => void }>();

function registerPlayer(player: { pause: () => void }) {
  activePlayers.add(player);
}

function unregisterPlayer(player: { pause: () => void }) {
  activePlayers.delete(player);
}

function pauseAllExcept(current: { pause: () => void }) {
  activePlayers.forEach((p) => {
    if (p !== current) p.pause();
  });
}

/**
 * Unified video/audio player.
 * Only one player plays at a time across the whole page.
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const start = Math.max(0, Math.floor(startSeconds));

  // YouTube iframe pause via postMessage
  const pauseYouTube = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        "*"
      );
    } catch {}
  }, []);

  // Register YouTube player
  useEffect(() => {
    if (!youtubeId) return;
    const player = { pause: pauseYouTube };
    registerPlayer(player);
    return () => unregisterPlayer(player);
  }, [youtubeId, pauseYouTube]);

  // Listen for YouTube iframe playing (via postMessage from YT API)
  useEffect(() => {
    if (!youtubeId) return;
    const handler = (e: MessageEvent) => {
      try {
        if (typeof e.data !== "string") return;
        const data = JSON.parse(e.data);
        // YT sends {"event":"onStateChange","info":1} when playing
        if (data?.event === "onStateChange" && data?.info === 1) {
          // This YT player started playing — pause all others
          const me = Array.from(activePlayers).find(
            (p) => p.pause === pauseYouTube
          );
          if (me) pauseAllExcept(me);
        }
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [youtubeId, pauseYouTube]);

  // HTML5 video: seek + single-player
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

    const player = {
      pause: () => {
        try { el.pause(); } catch {}
      },
    };
    registerPlayer(player);

    const onPlay = () => pauseAllExcept(player);

    el.addEventListener("loadedmetadata", seek);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("loadedmetadata", seek);
      el.removeEventListener("play", onPlay);
      unregisterPlayer(player);
    };
  }, [start, videoUrl]);

  // HTML5 audio: seek + single-player
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

    const player = {
      pause: () => {
        try { el.pause(); } catch {}
      },
    };
    registerPlayer(player);

    const onPlay = () => pauseAllExcept(player);

    el.addEventListener("loadedmetadata", seek);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("loadedmetadata", seek);
      el.removeEventListener("play", onPlay);
      unregisterPlayer(player);
    };
  }, [start, audioUrl]);

  // 1) YouTube — enablejsapi=1 for pause control
  if (youtubeId) {
    return (
      <div className="mt-3 w-full max-w-md">
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
          <iframe
            ref={iframeRef}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0, borderRadius: "0.5rem" }}
            src={`https://www.youtube.com/embed/${youtubeId}?start=${start}&enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}`}
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
