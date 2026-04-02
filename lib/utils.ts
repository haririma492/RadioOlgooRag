export function timeToSeconds(timeStr?: string | null): number {
  if (!timeStr || timeStr === "—") return 0;
  try {
    const parts = String(timeStr).split(":").map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  } catch {}
  return 0;
}

export function safeVideoCodeFromDisplay(display: string): string | null {
  if (!display || display === "All") return null;
  try {
    const m = display.match(/\(([^)]+)\)$/);
    return m?.[1] || null;
  } catch {
    return null;
  }
}

export const safePanelCodeFromDisplay = safeVideoCodeFromDisplay;

export function audioUrlFromFileName(fileName: string, _s3BaseUrl: string, _audioPrefix: string): string {
  // Serve from local API route: transcript .txt → .mp3
  const mp3Name = fileName
    .replace(/(_transcript)?(\.txt)?$/i, "")
    .replace(/_transcript/i, "") + ".mp3";
  return `/api/audio?file=${encodeURIComponent(mp3Name)}`;
}
