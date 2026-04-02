import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getWeaviateClient } from "@/lib/server/weaviate";
import { env } from "@/lib/server/env";
import { fetchAllPanelsRows } from "@/lib/server/panelsCache";

type Req = {
  question: string;
  selectedYear?: string;
  selectedCategory?: string;
  selectedVideoCode?: string;
};

function buildWhere(selectedCategory?: string, selectedVideoCode?: string) {
  const operands: any[] = [];

  const cat = (selectedCategory || "").trim();
  if (cat && cat !== "All") {
    operands.push({
      path: ["video_category"],
      operator: "Equal",
      valueText: cat,
    });
  }

  const vc = (selectedVideoCode || "").trim();
  if (vc && vc !== "All") {
    operands.push({
      path: ["video_code"],
      operator: "Equal",
      valueText: vc,
    });
  }

  if (operands.length === 0) return undefined;
  if (operands.length === 1) return operands[0];
  return { operator: "And", operands };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Req;
    const question = (body.question || "").trim();
    if (!question) {
      return NextResponse.json({ ok: false, error: "Missing question" }, { status: 400 });
    }

    // 1) embed query
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });
    const vector = emb.data[0].embedding;

    // 2) query weaviate
    const client = await getWeaviateClient();
    const where = buildWhere(body.selectedCategory, body.selectedVideoCode);

    const maxK = 10;  // upper bound
    const fetchK = 30; // over-fetch, then re-rank with keyword boost

    const fields = [
      "chunk_id",
      "video_code",
      "video_category",
      "doc_id",
      "file_name",
      "chunk_start_time",
      "chunk_speakers",
      "text",
      "_additional { score }",
    ].join("\n");

    // Extract distinctive keywords (skip stopwords and subject name)
    const stopwords = new Set(["the","and","was","were","what","did","does","how","who","why","when","where","about","that","this","with","from","have","has","had","for","are","but","not","you","all","can","her","his","its","our","they","will","been","each","make","like","than","them","then","some","into","over","such","just","also","most","very","said","say","says","reza","pahlavi","iran","iranian"]);

    // Transliteration / spelling variants (Farsi→English common differences)
    const spellingVariants: Record<string, string[]> = {
      kurdistan: ["kurdestan", "kordestan", "kordistan"],
      kurdestan: ["kurdistan", "kordestan", "kordistan"],
      kordestan: ["kurdistan", "kurdestan", "kordistan"],
      khamenei: ["khamenei", "khameini", "khameneii", "khamenai"],
      khameini: ["khamenei", "khamenai"],
      tehran: ["teheran", "tehraan"],
      teheran: ["tehran"],
      isfahan: ["esfahan", "isphahan"],
      esfahan: ["isfahan", "isphahan"],
      baluchistan: ["balochistan", "baluchestan", "balochestan"],
      balochistan: ["baluchistan", "baluchestan", "balochestan"],
      azarbaijan: ["azerbaijan", "azarbayjan"],
      azerbaijan: ["azarbaijan", "azarbayjan"],
      khuzestan: ["khuzistan", "khouzestan"],
      khuzistan: ["khuzestan", "khouzestan"],
      ahmadinejad: ["ahmadinezhad", "ahmadinejat"],
      rafsanjani: ["rafsandjani"],
      mousavi: ["moussavi", "musavi"],
      moussavi: ["mousavi", "musavi"],
      rouhani: ["rohani", "rowhani", "ruhani"],
      rohani: ["rouhani", "rowhani", "ruhani"],
      mossadegh: ["mosaddegh", "mossadeq", "mosadeq"],
      mosaddegh: ["mossadegh", "mossadeq", "mosadeq"],
      hezbollah: ["hizbollah", "hezballah", "hizbullah"],
      quran: ["koran", "quoran"],
      koran: ["quran", "quoran"],
      shiite: ["shia", "shiia"],
      shia: ["shiite", "shiia"],
      sunni: ["suni", "sunnie"],
      ayatollah: ["ayatolla"],
    };

    const rawTerms = question.toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3 && !stopwords.has(w));

    // Expand terms with spelling variants for BM25 (OR search)
    const expandedTerms: string[] = [];
    for (const term of rawTerms) {
      expandedTerms.push(term);
      if (spellingVariants[term]) {
        for (const variant of spellingVariants[term]) {
          if (!expandedTerms.includes(variant)) expandedTerms.push(variant);
        }
      }
    }

    // keyTerms = original distinctive terms (for keyword matching in scoring)
    const keyTerms = rawTerms;
    // bm25Query = expanded terms (catches spelling variants)
    const bm25Query = expandedTerms.length > 0 ? expandedTerms.join(" ") : question;

    // Two-pass retrieval: hybrid (semantic+keyword) + pure BM25 (keyword-only, distinctive terms)
    let hybridQ: any = client.graphql
      .get()
      .withClassName(env.WEAVIATE_DOCCHUNKS_COLLECTION)
      .withFields(fields)
      .withHybrid({ query: question, vector, alpha: 0.5 })
      .withLimit(fetchK);

    let bm25Q: any = client.graphql
      .get()
      .withClassName(env.WEAVIATE_DOCCHUNKS_COLLECTION)
      .withFields(fields)
      .withHybrid({ query: bm25Query, vector, alpha: 0 })
      .withLimit(fetchK);

    if (where) {
      hybridQ = hybridQ.withWhere(where);
      bm25Q = bm25Q.withWhere(where);
    }

    const [hybridRes, bm25Res] = await Promise.all([hybridQ.do(), bm25Q.do()]);
    const hybridRows: any[] = hybridRes?.data?.Get?.[env.WEAVIATE_DOCCHUNKS_COLLECTION] || [];
    const bm25Rows: any[] = bm25Res?.data?.Get?.[env.WEAVIATE_DOCCHUNKS_COLLECTION] || [];

    // Merge both sets, dedup by chunk key, assign scores from both lists
    const chunkScores = new Map<string, { row: any; hybridRank: number; bm25Rank: number }>();
    for (let i = 0; i < hybridRows.length; i++) {
      const r = hybridRows[i];
      const key = `${r.video_code}::${r.chunk_id}`;
      if (!chunkScores.has(key)) {
        chunkScores.set(key, { row: r, hybridRank: i + 1, bm25Rank: fetchK + 1 });
      }
    }
    for (let i = 0; i < bm25Rows.length; i++) {
      const r = bm25Rows[i];
      const key = `${r.video_code}::${r.chunk_id}`;
      const existing = chunkScores.get(key);
      if (existing) {
        existing.bm25Rank = i + 1;
      } else {
        chunkScores.set(key, { row: r, hybridRank: fetchK + 1, bm25Rank: i + 1 });
      }
    }

    // Score: RRF + keyword presence boost / absence penalty
    const scored = Array.from(chunkScores.values()).map((s) => {
      const base = 1 / s.hybridRank + 2 / s.bm25Rank;
      const textLower = (s.row.text || "").toLowerCase();
      // Check if term OR any of its spelling variants appear in the text
      const matched = keyTerms.filter((t) => {
        if (textLower.includes(t)) return true;
        const variants = spellingVariants[t];
        return variants ? variants.some((v) => textLower.includes(v)) : false;
      }).length;
      // Boost chunks containing key terms; penalize those missing them
      const kwFactor = keyTerms.length > 0
        ? matched === keyTerms.length ? 1.5    // all key terms present: boost
          : matched > 0 ? 1.0                  // some terms: neutral
          : 0.4                                 // no key terms: demote
        : 1.0;
      return { row: s.row, score: base * kwFactor };
    });

    scored.sort((a, b) => b.score - a.score);

    // 3) LLM Reranking: take top-20 candidates, ask GPT-4o-mini to score relevance
    const rerankerCandidates = scored.slice(0, 20);
    let rows: any[];

    try {
      const chunkList = rerankerCandidates.map((s, i) => {
        const text = (s.row.text || "").substring(0, 400);
        return `[${i}] ${text}`;
      }).join("\n\n");

      const rerankerResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: `You are a relevance ordering engine. Given a query and numbered text chunks, return a JSON array of chunk indices ordered by relevance (most relevant first). Include all chunks that have ANY connection to the query. Return ONLY a JSON array of numbers, e.g. [3,0,7,1,5]. Maximum 10 chunks.`,
          },
          {
            role: "user",
            content: `Query: ${question}\n\nChunks:\n${chunkList}`,
          },
        ],
      });

      const rerankerText = rerankerResp.choices[0]?.message?.content?.trim() || "";
      const indexMatch = rerankerText.match(/\[[\d,\s]+\]/);

      // Reranker gives us ordering; we also ensure keyword-matching chunks are never dropped
      let rerankedRows: any[];
      if (indexMatch) {
        const indices: number[] = JSON.parse(indexMatch[0]);
        rerankedRows = indices
          .filter((idx) => idx >= 0 && idx < rerankerCandidates.length)
          .slice(0, maxK)
          .map((idx) => rerankerCandidates[idx].row);

        // Ensure chunks with keyword hits that the reranker missed are included
        const rerankedKeys = new Set(rerankedRows.map((r) => `${r.video_code}::${r.chunk_id}`));
        for (const s of rerankerCandidates) {
          if (rerankedRows.length >= maxK) break;
          const textLower = (s.row.text || "").toLowerCase();
          const hasKeyword = keyTerms.some((t) => {
            if (textLower.includes(t)) return true;
            const variants = spellingVariants[t];
            return variants ? variants.some((v) => textLower.includes(v)) : false;
          });
          const key = `${s.row.video_code}::${s.row.chunk_id}`;
          if (hasKeyword && !rerankedKeys.has(key)) {
            rerankedRows.push(s.row);
            rerankedKeys.add(key);
          }
        }
      } else {
        rerankedRows = rerankerCandidates.slice(0, maxK).map((s) => s.row);
      }

      // Smart cutoff: drop trailing chunks that have NO keyword match AND low RRF score
      // Keep all chunks with keyword hits; only trim keyword-absent tail
      const topScore = scored[0]?.score ?? 1;
      const scoreThreshold = topScore * 0.25; // drop if below 25% of top score
      rows = [];
      for (const r of rerankedRows) {
        const textLower = (r.text || "").toLowerCase();
        const hasKeyword = keyTerms.length === 0 || keyTerms.some((t) => {
          if (textLower.includes(t)) return true;
          const variants = spellingVariants[t];
          return variants ? variants.some((v) => textLower.includes(v)) : false;
        });
        if (hasKeyword) {
          rows.push(r); // always keep keyword matches
        } else {
          // Check RRF score — keep if reasonably strong
          const entry = Array.from(chunkScores.values()).find(
            (s) => s.row.video_code === r.video_code && s.row.chunk_id === r.chunk_id
          );
          const base = entry ? (1 / entry.hybridRank + 2 / entry.bm25Rank) : 0;
          if (base >= scoreThreshold) {
            rows.push(r);
          }
        }
      }
    } catch (e: any) {
      console.error("Reranker failed, using RRF ranking:", e?.message);
      rows = rerankerCandidates.slice(0, maxK).map((s) => s.row);
      // Still apply smart cutoff on fallback
      const topScoreFb = scored[0]?.score ?? 1;
      const threshFb = topScoreFb * 0.25;
      rows = rows.filter((r) => {
        const textLower = (r.text || "").toLowerCase();
        const hasKw = keyTerms.length === 0 || keyTerms.some((t) => {
          if (textLower.includes(t)) return true;
          const variants = spellingVariants[t];
          return variants ? variants.some((v) => textLower.includes(v)) : false;
        });
        if (hasKw) return true;
        const entry = Array.from(chunkScores.values()).find(
          (s) => s.row.video_code === r.video_code && s.row.chunk_id === r.chunk_id
        );
        return entry ? (1 / entry.hybridRank + 2 / entry.bm25Rank) >= threshFb : false;
      });
    }

    // 5) Load video metadata
    const videoRows = await fetchAllPanelsRows();
    const byCode = new Map<string, any>();
    for (const r of videoRows) {
      byCode.set(r.video_code, r);
    }

    // 6) Group chunks by video_code
    const grouped = new Map<string, any>();

    rows.forEach((r, idx) => {
      const video_code = String(r.video_code || "").trim();
      if (!video_code) return;

      const meta = byCode.get(video_code);

      if (!grouped.has(video_code)) {
        grouped.set(video_code, {
          video_code,
          title: meta?.title || "",
          category: meta?.category || r.video_category || "",
          speakers: meta?.speakers || "",
          video_date: meta?.video_date || "",
          video_url: meta?.video_url || "",
          external_details_url: meta?.external_details_url || "",
          year: meta?.year || "",
          photo_url: meta?.photo_url || null,
          summary: meta?.summary || "",
          chunks: [] as any[],
        });
      }

      const g = grouped.get(video_code)!;
      g.chunks.push({
        rank: idx + 1,
        score: r?._additional?.score,
        chunk_id: r.chunk_id,
        chunk_start_time: r.chunk_start_time,
        chunk_speakers: r.chunk_speakers,
        text: r.text,
        doc_id: r.doc_id,
        file_name: r.file_name,
        video_code: r.video_code,
        video_category: r.video_category,
      });
    });

    const results = Array.from(grouped.values()).sort((a, b) => {
      const ra = a.chunks?.[0]?.rank ?? 9999;
      const rb = b.chunks?.[0]?.rank ?? 9999;
      return ra - rb;
    });

    // 7) RAG: Generate synthesized answer from top chunks
    const contextChunks = rows.slice(0, 5).map((r, i) => {
      const meta = byCode.get(String(r.video_code || "").trim());
      const title = meta?.title || r.file_name || "Unknown";
      const time = r.chunk_start_time || "00:00:00";
      return `[Source ${i + 1}: "${title}" at ${time}]\n${r.text}`;
    });

    let aiAnswer = "";
    if (contextChunks.length > 0) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 600,
          messages: [
            {
              role: "system",
              content: `You are a research assistant specializing in Reza Pahlavi's public statements and interviews. Answer the user's question based ONLY on the provided transcript excerpts. Cite sources using [Source N] references. If the excerpts don't contain enough information, say so. Be concise and factual.`,
            },
            {
              role: "user",
              content: `Question: ${question}\n\nTranscript excerpts:\n\n${contextChunks.join("\n\n")}`,
            },
          ],
        });
        aiAnswer = completion.choices[0]?.message?.content?.trim() || "";
      } catch (e: any) {
        console.error("RAG answer generation failed:", e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      topK: rows.length,
      aiAnswer,
      results,
      s3: {
        base: `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`,
        audioPrefix: env.S3_AUDIO_PREFIX,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Search error" }, { status: 500 });
  }
}
