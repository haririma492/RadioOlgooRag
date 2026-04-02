"use client";

import { useEffect, useRef } from "react";

export default function AudioPlayer({ src, startSeconds }: { src: string; startSeconds: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const seek = () => {
      try {
        if (Number.isFinite(startSeconds) && startSeconds > 0 && el.duration && startSeconds < el.duration) {
          el.currentTime = startSeconds;
        }
      } catch {}
    };

    el.addEventListener("loadedmetadata", seek);
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [startSeconds, src]);

  return <audio ref={ref} controls preload="none" src={src} className="w-full" />;
}
