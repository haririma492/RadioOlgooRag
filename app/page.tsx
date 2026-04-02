"use client";

import { useEffect, useMemo, useState } from "react";
import VideoBlock from "@/components/VideoBlock";
import { VideoRow, VideoResult } from "@/lib/types";

type VideosResp = { ok: boolean; rows?: VideoRow[]; error?: string };

type SearchResp = {
  ok: boolean;
  error?: string;
  topK?: number;
  aiAnswer?: string;
  results?: any[];
  s3?: { base: string; audioPrefix: string };
};

export default function HomePage() {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  const [question, setQuestion] = useState("");
  const [selectedYear, setSelectedYear] = useState("All");

  const [isSearching, setIsSearching] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [results, setResults] = useState<any[]>([]);
  const [topK, setTopK] = useState<number>(0);
  const [aiAnswer, setAiAnswer] = useState<string>("");

  const [s3BaseUrl, setS3BaseUrl] = useState<string>("");
  const [audioPrefix, setAudioPrefix] = useState<string>("media");

  const debug = false;

  // ---- load video metadata ----
  useEffect(() => {
    (async () => {
      try {
        setLoadingVideos(true);
        const r = await fetch("/api/panels", { cache: "no-store" });
        const t = await r.text();
        let j: VideosResp;
        try {
          j = JSON.parse(t);
        } catch {
          throw new Error(`Videos API returned non-JSON (HTTP ${r.status})`);
        }
        if (!j.ok) throw new Error(j.error || "Failed to load videos");
        setVideos(j.rows || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load videos");
      } finally {
        setLoadingVideos(false);
      }
    })();
  }, []);

  const yearOptions = useMemo(() => {
    const ys = Array.from(new Set(videos.map((v) => v.year).filter((y) => /^\d+$/.test(y))));
    ys.sort((a, b) => Number(b) - Number(a));
    return ["All", ...ys];
  }, [videos]);

  async function onSearch() {
    setWarning(null);
    setError(null);
    setResults([]);
    setTopK(0);
    setAiAnswer("");

    if (!question.trim()) {
      setWarning("Please enter a question.");
      return;
    }

    setIsSearching(true);

    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          selectedYear,
        }),
      });

      const t = await r.text();
      let j: SearchResp;
      try {
        j = JSON.parse(t);
      } catch {
        throw new Error(`Search API returned non-JSON (HTTP ${r.status})`);
      }

      if (!j.ok) throw new Error(j.error || "Search error");

      const rr = Array.isArray(j.results) ? j.results : [];
      setResults(rr);
      setTopK(j.topK || 0);
      setAiAnswer(j.aiAnswer || "");

      if (j.s3?.base) setS3BaseUrl(j.s3.base);
      if (j.s3?.audioPrefix) setAudioPrefix(j.s3.audioPrefix);

      if (rr.length === 0) setWarning("No results found.");
    } catch (e: any) {
      setError(e?.message || "Search error");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="container-max">
      {/* Header */}
      <div className="text-center py-6">
        <h1 className="text-[2.4rem] font-black text-[var(--cspc-blue)]">
          Reza Pahlavi Video Search
        </h1>
        <p className="text-[1.1rem] text-gray-600 italic mt-1">
          Search {videos.length > 0 ? `${videos.length} ` : ""}English interviews and speeches
        </p>
      </div>

      {/* Search controls */}
      <div className="mt-4 max-w-5xl mx-auto">
        <div className="text-[var(--cspc-blue)] text-xl font-bold mb-2">
          Ask anything about Reza Pahlavi&apos;s interviews
        </div>

        <input
          className="w-full px-4 py-3 input-cspc"
          placeholder="e.g. What did Reza Pahlavi say about Iran's future?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />

        <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_3fr] gap-4">
          <div>
            <div className="text-[1.1rem] font-bold mb-2">Year</div>
            <select
              className="w-full px-3 py-3 select-cspc"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              disabled={loadingVideos}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              className="bg-[var(--cspc-blue)] text-white font-semibold px-8 py-3 rounded-lg disabled:opacity-60"
              onClick={onSearch}
              disabled={isSearching || loadingVideos}
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {warning && <div className="mt-4 text-center text-amber-700">{warning}</div>}
        {error && <div className="mt-4 text-center text-red-700">{error}</div>}
      </div>

      {/* AI Answer */}
      {aiAnswer && (
        <div className="max-w-5xl mx-auto mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-[var(--cspc-blue)] font-bold text-lg mb-3">AI Answer</div>
          <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">{aiAnswer}</div>
        </div>
      )}

      {/* Results */}
      {topK > 0 && results.length > 0 && (
        <div className="text-center my-10 text-[var(--cspc-blue)]" style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          Top {topK} Results — Source Excerpts
        </div>
      )}

      <ResultsView
        results={results}
        videos={videos}
        s3BaseUrl={s3BaseUrl}
        audioPrefix={audioPrefix}
        debug={debug}
      />
    </div>
  );
}

function ResultsView({
  results,
  videos,
  s3BaseUrl,
  audioPrefix,
  debug,
}: {
  results: any[];
  videos: VideoRow[];
  s3BaseUrl: string;
  audioPrefix: string;
  debug: boolean;
}) {
  const videoMetaByCode = useMemo(() => {
    const best = new Map<string, VideoRow>();
    for (const r of videos) {
      const code = String(r.video_code || "").trim();
      if (!code) continue;
      if (!best.has(code)) best.set(code, r);
    }
    return best;
  }, [videos]);

  const videoResults: any[] = useMemo(() => {
    if (!Array.isArray(results) || results.length === 0) return [];

    // Check if results are already grouped
    const r0 = results[0];
    if (r0 && typeof r0.video_code !== "undefined" && Array.isArray(r0.chunks)) {
      return results.map((v: any, idx: number) => {
        const code = String(v?.video_code ?? "").trim();
        const meta = v?.video_meta ?? videoMetaByCode.get(code);
        const ch = Array.isArray(v?.chunks) ? v.chunks : [];
        return {
          ...v,
          video_code: code,
          video_meta: meta,
          chunks: ch.map((c: any, i: number) => ({ ...c, rank: c?.rank ?? i + 1 })),
        };
      });
    }

    // Group chunk rows by video_code
    const map = new Map<string, any>();
    for (let i = 0; i < results.length; i++) {
      const chunk = results[i] || {};
      const code = String(chunk.video_code ?? "").trim();
      if (!code) continue;
      if (!map.has(code)) {
        map.set(code, {
          video_code: code,
          video_meta: videoMetaByCode.get(code),
          chunks: [],
        });
      }
      map.get(code).chunks.push({ ...chunk, rank: chunk.rank ?? i + 1 });
    }
    return Array.from(map.values());
  }, [results, videoMetaByCode]);

  if (!videoResults.length) return null;

  return (
    <div className="max-w-6xl mx-auto px-4">
      {videoResults.map((v) => (
        <VideoBlock
          key={`video-${v.video_code}`}
          panel={v as VideoResult}
          s3BaseUrl={s3BaseUrl}
          audioPrefix={audioPrefix}
          debug={debug}
        />
      ))}
    </div>
  );
}
