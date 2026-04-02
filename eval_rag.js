#!/usr/bin/env node
/**
 * RAG Evaluation Script for Reza Pahlavi Video Search
 *
 * Runs eval_queries.json against the search API and grades results on:
 *   - Keyword Hit Rate (KHR): % of top-10 chunks with expected keywords
 *   - Mean Reciprocal Rank (MRR): 1/rank of first keyword-matching chunk
 *   - Answer Relevance (AR): % of expected terms found in AI answer
 *   - Latency: response time in ms
 *
 * Usage:
 *   node eval_rag.js                   # Run evaluation
 *   node eval_rag.js --baseline        # Save results as baseline
 *   node eval_rag.js --compare         # Compare against saved baseline
 *   node eval_rag.js --url http://...  # Override API URL
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEFAULT_API_URL = "http://localhost:3002/api/search";
const QUERIES_FILE = path.join(__dirname, "eval_queries.json");
const RESULTS_FILE = path.join(__dirname, "eval_results.json");
const BASELINE_FILE = path.join(__dirname, "eval_baseline.json");

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    baseline: false,
    compare: false,
    url: DEFAULT_API_URL,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--baseline") flags.baseline = true;
    else if (args[i] === "--compare") flags.compare = true;
    else if (args[i] === "--url" && args[i + 1]) flags.url = args[++i];
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all chunk texts from the API response.
 * The API groups results by video_code, each containing a chunks array.
 */
function extractChunks(results) {
  const chunks = [];
  for (const group of results || []) {
    for (const chunk of group.chunks || []) {
      chunks.push({
        rank: chunk.rank,
        text: (chunk.text || "").toLowerCase(),
        video_code: chunk.video_code || group.video_code,
      });
    }
  }
  // Sort by rank to ensure correct ordering
  chunks.sort((a, b) => a.rank - b.rank);
  return chunks;
}

/**
 * Check if a chunk's text contains at least one of the expected keywords.
 * Case-insensitive matching.
 */
function chunkMatchesKeywords(chunkText, keywords) {
  return keywords.some((kw) => chunkText.includes(kw.toLowerCase()));
}

/**
 * Calculate Keyword Hit Rate: fraction of top-10 chunks that contain
 * at least one expected keyword.
 */
function calcKHR(chunks, keywords) {
  if (chunks.length === 0 || keywords.length === 0) return 0;
  const top10 = chunks.slice(0, 10);
  const hits = top10.filter((c) => chunkMatchesKeywords(c.text, keywords)).length;
  return hits / top10.length;
}

/**
 * Calculate Mean Reciprocal Rank: 1/rank of the first chunk that
 * contains an expected keyword.
 */
function calcMRR(chunks, keywords) {
  if (keywords.length === 0) return 0;
  for (const chunk of chunks.slice(0, 10)) {
    if (chunkMatchesKeywords(chunk.text, keywords)) {
      return 1 / chunk.rank;
    }
  }
  return 0;
}

/**
 * Calculate Answer Relevance: fraction of answer_should_mention terms
 * found in the AI answer text.
 */
function calcAR(aiAnswer, expectedTerms) {
  if (!expectedTerms || expectedTerms.length === 0) return 1; // No requirements = pass
  const answerLower = (aiAnswer || "").toLowerCase();
  const hits = expectedTerms.filter((t) => answerLower.includes(t.toLowerCase())).length;
  return hits / expectedTerms.length;
}

/**
 * Determine pass/warn/fail status for a query result.
 *   PASS = KHR >= min_keyword_hits/10 AND AR >= 50%
 *   WARN = KHR >= min_keyword_hits/20 OR AR >= 30%
 *   FAIL = everything else
 */
function getStatus(khr, ar, minKeywordHits) {
  const khrThreshold = minKeywordHits / 10; // Convert count to fraction
  const khrHalf = khrThreshold / 2;

  if (khr >= khrThreshold && ar >= 0.5) return "PASS";
  if (khr >= khrHalf || ar >= 0.3) return "WARN";
  return "FAIL";
}

/**
 * Make a single search request and return timing + response.
 */
async function runQuery(url, question) {
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  const latency = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return { data, latency };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function pct(value) {
  return (value * 100).toFixed(1) + "%";
}

function pad(str, len) {
  return String(str).padEnd(len);
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------
async function main() {
  const flags = parseArgs();

  // Load queries
  if (!fs.existsSync(QUERIES_FILE)) {
    console.error(`Error: ${QUERIES_FILE} not found`);
    process.exit(1);
  }
  const queries = JSON.parse(fs.readFileSync(QUERIES_FILE, "utf8"));
  console.log(`\nLoaded ${queries.length} evaluation queries`);
  console.log(`API endpoint: ${flags.url}\n`);

  // Run all queries sequentially (to avoid overloading the API)
  const results = [];
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const label = `[${i + 1}/${queries.length}] ${q.id}: "${q.question}"`;
    process.stdout.write(`  Running ${label}... `);

    try {
      const { data, latency } = await runQuery(flags.url, q.question);

      const chunks = extractChunks(data.results);
      const khr = calcKHR(chunks, q.expected_keywords);
      const mrr = calcMRR(chunks, q.expected_keywords);
      const ar = calcAR(data.aiAnswer, q.answer_should_mention);
      const hasAnswer = Boolean(data.aiAnswer && data.aiAnswer.trim().length > 0);
      const status = getStatus(khr, ar, q.min_keyword_hits);

      const result = {
        id: q.id,
        question: q.question,
        type: q.type,
        khr,
        mrr,
        ar,
        hasAnswer,
        latency,
        status,
        chunksReturned: chunks.length,
        aiAnswerLength: (data.aiAnswer || "").length,
      };
      results.push(result);
      console.log(`${status} KHR=${pct(khr)} MRR=${mrr.toFixed(2)} AR=${pct(ar)} ${latency}ms`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({
        id: q.id,
        question: q.question,
        type: q.type,
        khr: 0,
        mrr: 0,
        ar: 0,
        hasAnswer: false,
        latency: 0,
        status: "FAIL",
        error: err.message,
        chunksReturned: 0,
        aiAnswerLength: 0,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Aggregate metrics
  // ---------------------------------------------------------------------------
  const aggregate = (subset) => {
    if (subset.length === 0) return { khr: 0, mrr: 0, ar: 0, answerRate: 0, avgLatency: 0 };
    const sum = (arr, fn) => arr.reduce((acc, r) => acc + fn(r), 0);
    return {
      khr: sum(subset, (r) => r.khr) / subset.length,
      mrr: sum(subset, (r) => r.mrr) / subset.length,
      ar: sum(subset, (r) => r.ar) / subset.length,
      answerRate: sum(subset, (r) => (r.hasAnswer ? 1 : 0)) / subset.length,
      avgLatency: Math.round(sum(subset, (r) => r.latency) / subset.length),
    };
  };

  const overall = aggregate(results);
  const byType = {};
  const types = [...new Set(results.map((r) => r.type))];
  for (const t of types) {
    byType[t] = aggregate(results.filter((r) => r.type === t));
  }

  // ---------------------------------------------------------------------------
  // Print report
  // ---------------------------------------------------------------------------
  const now = new Date().toISOString().split("T")[0];
  const passCount = results.filter((r) => r.status === "PASS").length;
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;

  const report = [];
  report.push("");
  report.push("=== RAG Evaluation Report ===");
  report.push(`Date: ${now}`);
  report.push(`Queries: ${results.length}`);
  report.push(`Results: ${passCount} PASS / ${warnCount} WARN / ${failCount} FAIL`);
  report.push("");
  report.push("Overall Metrics:");
  report.push(`  Keyword Hit Rate:    ${pct(overall.khr)}`);
  report.push(`  Mean Reciprocal Rank: ${overall.mrr.toFixed(2)}`);
  report.push(`  Answer Relevance:    ${pct(overall.ar)}`);
  report.push(`  AI Answer Rate:      ${pct(overall.answerRate)}`);
  report.push(`  Avg Latency:         ${overall.avgLatency}ms`);
  report.push("");
  report.push("By Type:");
  for (const t of types) {
    const m = byType[t];
    report.push(
      `  ${pad(t + ":", 12)} KHR=${pad(pct(m.khr), 7)} MRR=${pad(m.mrr.toFixed(2), 5)} AR=${pad(pct(m.ar), 7)} Latency=${m.avgLatency}ms`
    );
  }
  report.push("");
  report.push("Per-Query Detail:");
  for (const r of results) {
    const tag = r.status === "PASS" ? "[PASS]" : r.status === "WARN" ? "[WARN]" : "[FAIL]";
    const errNote = r.error ? ` ERROR: ${r.error}` : "";
    report.push(
      `  ${tag} ${pad(r.id + ":", 10)} "${r.question}" KHR=${pct(r.khr)} MRR=${r.mrr.toFixed(2)} AR=${pct(r.ar)} ${r.latency}ms${errNote}`
    );
  }

  const reportText = report.join("\n");
  console.log(reportText);

  // ---------------------------------------------------------------------------
  // Save results
  // ---------------------------------------------------------------------------
  const output = {
    date: now,
    apiUrl: flags.url,
    queryCount: results.length,
    overall,
    byType,
    results,
  };

  const outputFile = flags.baseline ? BASELINE_FILE : RESULTS_FILE;
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), "utf8");
  console.log(`\nResults saved to ${outputFile}`);

  if (flags.baseline) {
    console.log("Baseline saved. Use --compare on future runs to see deltas.");
  }

  // ---------------------------------------------------------------------------
  // Compare with baseline if requested
  // ---------------------------------------------------------------------------
  if (flags.compare) {
    if (!fs.existsSync(BASELINE_FILE)) {
      console.log("\nNo baseline found. Run with --baseline first to create one.");
    } else {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
      console.log("\n=== Comparison vs Baseline ===");
      console.log(`Baseline date: ${baseline.date}`);
      console.log("");

      const delta = (current, base) => {
        const d = current - base;
        const sign = d >= 0 ? "+" : "";
        return sign + d.toFixed(2);
      };
      const deltaPct = (current, base) => {
        const d = (current - base) * 100;
        const sign = d >= 0 ? "+" : "";
        return sign + d.toFixed(1) + "%";
      };

      console.log("Overall:");
      console.log(`  KHR:     ${pct(overall.khr)} (${deltaPct(overall.khr, baseline.overall.khr)})`);
      console.log(`  MRR:     ${overall.mrr.toFixed(2)} (${delta(overall.mrr, baseline.overall.mrr)})`);
      console.log(`  AR:      ${pct(overall.ar)} (${deltaPct(overall.ar, baseline.overall.ar)})`);
      console.log(`  Latency: ${overall.avgLatency}ms (${delta(overall.avgLatency, baseline.overall.avgLatency)}ms)`);
      console.log("");

      // Per-query comparison
      const baselineById = {};
      for (const r of baseline.results || []) {
        baselineById[r.id] = r;
      }

      console.log("Per-Query Changes:");
      for (const r of results) {
        const b = baselineById[r.id];
        if (!b) {
          console.log(`  [NEW]  ${r.id}: no baseline data`);
          continue;
        }
        const khrDelta = r.khr - b.khr;
        const mrrDelta = r.mrr - b.mrr;
        const arDelta = r.ar - b.ar;
        const changed = Math.abs(khrDelta) > 0.01 || Math.abs(mrrDelta) > 0.01 || Math.abs(arDelta) > 0.01;

        if (changed) {
          const statusChange = r.status !== b.status ? ` ${b.status}->${r.status}` : "";
          const indicator = khrDelta + mrrDelta + arDelta > 0 ? "[IMPROVED]" : "[REGRESSED]";
          console.log(
            `  ${indicator} ${pad(r.id + ":", 10)} KHR ${deltaPct(r.khr, b.khr)} MRR ${delta(r.mrr, b.mrr)} AR ${deltaPct(r.ar, b.ar)}${statusChange}`
          );
        }
      }

      // Summary
      const improved = results.filter((r) => {
        const b = baselineById[r.id];
        return b && r.khr + r.mrr + r.ar > b.khr + b.mrr + b.ar + 0.03;
      }).length;
      const regressed = results.filter((r) => {
        const b = baselineById[r.id];
        return b && r.khr + r.mrr + r.ar < b.khr + b.mrr + b.ar - 0.03;
      }).length;
      const unchanged = results.length - improved - regressed;
      console.log(`\nSummary: ${improved} improved, ${regressed} regressed, ${unchanged} unchanged`);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
