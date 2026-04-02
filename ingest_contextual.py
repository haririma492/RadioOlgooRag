"""
Contextual Retrieval ingestion for Reza Pahlavi transcripts into Weaviate.

Implements Anthropic's Contextual Retrieval pattern:
- For each chunk, GPT-4o-mini generates a short context prefix situating the
  chunk within the full transcript.
- The context is prepended to the chunk text before embedding.
- This dramatically improves BM25 + vector hybrid retrieval.

Reuses chunking, env loading, and metadata matching from ingest_to_weaviate.py.
"""

import os
import sys
import re
import json
import uuid
import time
import argparse
from pathlib import Path
from typing import List, Dict, Optional

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(".env.local")

# Also load from CSPC React_RezaPahlavi env (has Weaviate creds)
CSPC_ENV = Path(__file__).parent.parent / "CSPC" / "React_RezaPahlavi" / ".env.local"
if CSPC_ENV.exists():
    for line in CSPC_ENV.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"')
            if k and v and not os.getenv(k):
                os.environ[k] = v

# ---- Config ----
WEAVIATE_URL = os.getenv("WEAVIATE_URL", "").strip()
WEAVIATE_API_KEY = os.getenv("WEAVIATE_API_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()

DOCCHUNK_COLLECTION = "Olgoo_DocChunk"
EMBED_MODEL = "text-embedding-3-small"
CONTEXT_MODEL = "gpt-4o-mini"
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 200
EMBED_BATCH_SIZE = 50  # OpenAI embedding batch limit
CONTEXT_BATCH_DELAY = 0.05  # seconds between GPT-4o-mini calls (rate limiting)

TRANSCRIPTS_DIR = Path("transcripts")
METADATA_FILE = Path("shah_verified_english.json")
CHECKPOINT_FILE = Path("contextual_progress.json")

openai_client = OpenAI(api_key=OPENAI_API_KEY)


# ---- Text Cleaning (from ingest_to_weaviate.py) ----
def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"\[\d{1,2}:\d{2}:\d{2}\]", "", text)
    text = re.sub(r"\[\d{1,2}:\d{2}\]", "", text)
    text = re.sub(r"(?<!\d)\d{1,2}:\d{2}:\d{2}(?!\d)", "", text)
    text = re.sub(r"Speaker\s*\d*\s*:", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([.,!?;:])", r"\1", text)
    return text.strip()


def extract_metadata_from_line(line: str):
    line = line.strip()
    if not line:
        return None, ""
    timestamp = None
    ts_match = re.match(r"^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$", line)
    if ts_match:
        timestamp = ts_match.group(1)
        if len(timestamp.split(":")) == 2:
            timestamp = f"00:{timestamp}"
        rest = ts_match.group(2)
    else:
        rest = line
    clean = clean_text(rest)
    return timestamp, clean


# ---- Chunking (from ingest_to_weaviate.py) ----
def parse_transcript(text: str) -> List[Dict]:
    segments = []
    for line in text.split("\n"):
        if not line.strip():
            continue
        timestamp, clean = extract_metadata_from_line(line)
        if not clean:
            if segments:
                segments[-1]["text"] += " " + clean_text(line)
            continue
        if timestamp:
            segments.append({"timestamp": timestamp, "text": clean})
        else:
            if segments:
                segments[-1]["text"] += " " + clean
            else:
                segments.append({"timestamp": "00:00:00", "text": clean})
    return segments


def create_chunks(
    segments: List[Dict], file_name: str, video_code: str
) -> List[Dict]:
    if not segments:
        return []

    chunks = []
    current_texts = []
    current_length = 0
    current_ts = segments[0]["timestamp"]
    chunk_id = 0

    for seg in segments:
        seg_text = seg["text"]
        if not current_texts:
            current_ts = seg["timestamp"]

        if current_length + len(seg_text) > CHUNK_SIZE and current_texts:
            combined = clean_text(" ".join(current_texts))
            chunks.append(
                {
                    "doc_id": str(uuid.uuid4()),
                    "chunk_id": chunk_id,
                    "text": combined,
                    "file_name": file_name,
                    "chunk_start_time": current_ts,
                    "chunk_speakers": "",
                    "video_code": video_code,
                    "video_category": "Reza Pahlavi English",
                    "conference_year": 2025,
                    "reserved_field": "",
                }
            )
            chunk_id += 1

            # Overlap
            if CHUNK_OVERLAP > 0:
                overlap_texts = []
                overlap_len = 0
                for txt in reversed(current_texts):
                    if overlap_len + len(txt) <= CHUNK_OVERLAP:
                        overlap_texts.insert(0, txt)
                        overlap_len += len(txt)
                    else:
                        break
                current_texts = overlap_texts
                current_length = overlap_len
            else:
                current_texts = []
                current_length = 0

            current_ts = seg["timestamp"]

        current_texts.append(seg_text)
        current_length += len(seg_text) + 1

    # Last chunk
    if current_texts:
        combined = clean_text(" ".join(current_texts))
        chunks.append(
            {
                "doc_id": str(uuid.uuid4()),
                "chunk_id": chunk_id,
                "text": combined,
                "file_name": file_name,
                "chunk_start_time": current_ts,
                "chunk_speakers": "",
                "video_code": video_code,
                "video_category": "Reza Pahlavi English",
                "conference_year": 2025,
                "reserved_field": "",
            }
        )

    return chunks


# ---- Metadata Matching (from ingest_to_weaviate.py) ----
def match_transcript_to_video(
    transcript_stem: str, videos: List[Dict]
) -> Optional[Dict]:
    stem_lower = transcript_stem.lower().replace("_", " ")
    best_match = None
    best_score = 0
    for video in videos:
        title = str(video.get("title", "")).lower()
        stem_words = set(stem_lower.split())
        title_words = set(title.split())
        overlap = len(stem_words & title_words)
        if overlap > best_score:
            best_score = overlap
            best_match = video
    return best_match if best_score >= 2 else None


def extract_video_code(video: Dict) -> str:
    pk = str(video.get("PK", ""))
    url = str(video.get("url", ""))
    m = re.search(
        r"(?:youtube\.com/watch\?v=|youtu\.be/)([A-Za-z0-9_-]{11})", url
    )
    if m:
        return f"yt_{m.group(1)}"
    m = re.search(r"id#([A-Za-z0-9_-]{11})#", pk)
    if m:
        return f"yt_{m.group(1)}"
    if "MEDIA#" in pk:
        return pk.replace("MEDIA#", "s3_")[:30]
    return str(uuid.uuid4())[:8]


# ---- Contextual Retrieval ----
CONTEXT_PROMPT_TEMPLATE = """\
<document>
{full_text}
</document>
Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_text}
</chunk>
Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else."""


def generate_context(full_text: str, chunk_text: str) -> str:
    """Call GPT-4o-mini to generate a contextual prefix for a chunk."""
    # Truncate full_text if extremely long to stay within context window
    # GPT-4o-mini has 128k context; transcripts are well under that
    prompt = CONTEXT_PROMPT_TEMPLATE.format(
        full_text=full_text[:100_000], chunk_text=chunk_text
    )
    try:
        resp = openai_client.chat.completions.create(
            model=CONTEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.0,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        print(f"    Context generation error: {e}")
        return ""


def batch_embed(texts: List[str]) -> List[Optional[List[float]]]:
    """Get embeddings for a batch of texts."""
    try:
        resp = openai_client.embeddings.create(model=EMBED_MODEL, input=texts)
        # Response data is sorted by index
        results = [None] * len(texts)
        for item in resp.data:
            results[item.index] = item.embedding
        return results
    except Exception as e:
        print(f"    Batch embedding error: {e}")
        return [None] * len(texts)


# ---- Weaviate ----
def get_weaviate_client():
    import weaviate
    from weaviate.classes.init import Auth

    return weaviate.connect_to_weaviate_cloud(
        cluster_url=(
            f"https://{WEAVIATE_URL}"
            if not WEAVIATE_URL.startswith("http")
            else WEAVIATE_URL
        ),
        auth_credentials=Auth.api_key(WEAVIATE_API_KEY),
    )


def recreate_collection(wclient):
    """Delete and recreate Olgoo_DocChunk with correct schema."""
    import weaviate.classes.config as wvc

    if wclient.collections.exists(DOCCHUNK_COLLECTION):
        print(f"Deleting existing collection '{DOCCHUNK_COLLECTION}'...")
        wclient.collections.delete(DOCCHUNK_COLLECTION)
        print("  Deleted.")

    print(f"Creating collection '{DOCCHUNK_COLLECTION}'...")
    wclient.collections.create(
        name=DOCCHUNK_COLLECTION,
        properties=[
            wvc.Property(name="doc_id", data_type=wvc.DataType.TEXT),
            wvc.Property(name="chunk_id", data_type=wvc.DataType.INT),
            wvc.Property(
                name="text",
                data_type=wvc.DataType.TEXT,
                tokenization=wvc.Tokenization.WORD,
                index_searchable=True,
            ),
            wvc.Property(name="file_name", data_type=wvc.DataType.TEXT),
            wvc.Property(name="chunk_start_time", data_type=wvc.DataType.TEXT),
            wvc.Property(name="chunk_speakers", data_type=wvc.DataType.TEXT),
            wvc.Property(name="video_code", data_type=wvc.DataType.TEXT),
            wvc.Property(name="video_category", data_type=wvc.DataType.TEXT),
            wvc.Property(name="conference_year", data_type=wvc.DataType.INT),
            wvc.Property(name="reserved_field", data_type=wvc.DataType.TEXT),
        ],
    )
    print("  Created.")


# ---- Checkpoint ----
def load_checkpoint() -> Dict:
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"completed_transcripts": [], "total_chunks_ingested": 0}


def save_checkpoint(state: Dict):
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


# ---- Main ----
def main():
    parser = argparse.ArgumentParser(
        description="Contextual Retrieval ingestion for Weaviate"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without calling APIs",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from checkpoint (skip already-processed transcripts)",
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Ignore checkpoint, start fresh (deletes and recreates collection)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Contextual Retrieval Ingestion")
    print("=" * 60)
    if args.dry_run:
        print("[DRY RUN] No API calls will be made.\n")

    # Load metadata
    with open(METADATA_FILE, encoding="utf-8") as f:
        videos = json.load(f)
    print(f"Loaded {len(videos)} video metadata records")

    # Find transcripts
    transcripts = sorted(TRANSCRIPTS_DIR.glob("*.txt"))
    print(f"Found {len(transcripts)} transcripts")

    if not transcripts:
        print("No transcripts found. Run whisper_transcribe.py first.")
        return

    # Load checkpoint
    checkpoint = load_checkpoint()
    completed = set(checkpoint.get("completed_transcripts", []))

    if args.fresh:
        completed = set()
        checkpoint = {"completed_transcripts": [], "total_chunks_ingested": 0}
        if CHECKPOINT_FILE.exists():
            CHECKPOINT_FILE.unlink()
            print("Cleared checkpoint file.")

    if args.resume and completed:
        print(f"Resuming: {len(completed)} transcripts already processed")

    # Pre-scan: count total chunks to estimate time
    print("\nPre-scanning transcripts for chunk counts...")
    transcript_data = []  # (path, text, segments, chunks, video, video_code)
    total_chunk_count = 0

    for i, transcript in enumerate(transcripts):
        name = transcript.stem
        text = transcript.read_text(encoding="utf-8")
        if not text.strip():
            continue

        video = match_transcript_to_video(name, videos)
        video_code = extract_video_code(video) if video else f"unknown_{i}"

        segments = parse_transcript(text)
        chunks = create_chunks(segments, transcript.name, video_code)

        full_clean_text = clean_text(text)
        transcript_data.append(
            (transcript, full_clean_text, segments, chunks, video, video_code)
        )
        total_chunk_count += len(chunks)

    pending_transcripts = [
        td for td in transcript_data if td[0].stem not in completed
    ]
    pending_chunks = sum(len(td[3]) for td in pending_transcripts)

    print(f"Total: {len(transcript_data)} transcripts, {total_chunk_count} chunks")
    print(f"Pending: {len(pending_transcripts)} transcripts, {pending_chunks} chunks")

    # Estimate time: ~0.5s per context call + embedding batching
    est_seconds = pending_chunks * 0.6
    est_minutes = est_seconds / 60
    print(f"Estimated time: ~{est_minutes:.0f} minutes ({est_seconds:.0f}s)")

    if args.dry_run:
        print("\n--- Dry Run Summary ---")
        for td in transcript_data:
            path, full_text, segs, chunks, video, vcode = td
            status = "SKIP (done)" if path.stem in completed else "PENDING"
            title = video.get("title", path.stem)[:60] if video else path.stem[:60]
            print(f"  [{status}] {path.stem[:50]} -> {len(chunks)} chunks | {title}")
        print(f"\nTotal chunks to process: {pending_chunks}")
        print(f"Collection '{DOCCHUNK_COLLECTION}' would be deleted and recreated.")
        return

    # Connect to Weaviate
    print("\nConnecting to Weaviate...")
    wclient = get_weaviate_client()
    print("Connected.")

    # Delete and recreate collection (unless resuming with data already in it)
    if not args.resume or args.fresh or not completed:
        recreate_collection(wclient)

    docchunk_coll = wclient.collections.get(DOCCHUNK_COLLECTION)

    # Process each transcript
    total_ingested = checkpoint.get("total_chunks_ingested", 0)
    total_failed = 0
    start_time = time.time()
    chunks_processed_this_run = 0

    for t_idx, (transcript, full_text, segments, chunks, video, video_code) in enumerate(
        transcript_data
    ):
        name = transcript.stem

        if name in completed:
            print(f"\n[{t_idx+1}/{len(transcript_data)}] {name[:55]} [SKIP - already done]")
            continue

        print(f"\n[{t_idx+1}/{len(transcript_data)}] {name[:55]}")
        print(f"  {len(segments)} segments -> {len(chunks)} chunks")

        if not chunks:
            print("  [SKIP] No chunks")
            completed.add(name)
            continue

        # Phase 1: Generate contextual prefixes for all chunks in this transcript
        print(f"  Generating context for {len(chunks)} chunks...")
        contextualized_texts = []
        ctx_start = time.time()

        for c_idx, chunk in enumerate(chunks):
            context = generate_context(full_text, chunk["text"])
            if context:
                contextualized = f"{context}\n\n{chunk['text']}"
            else:
                contextualized = chunk["text"]
            contextualized_texts.append(contextualized)

            # Rate limiting
            if CONTEXT_BATCH_DELAY > 0:
                time.sleep(CONTEXT_BATCH_DELAY)

            # Progress every 10 chunks
            if (c_idx + 1) % 10 == 0 or c_idx == len(chunks) - 1:
                elapsed_ctx = time.time() - ctx_start
                rate = (c_idx + 1) / elapsed_ctx if elapsed_ctx > 0 else 0
                remaining = (len(chunks) - c_idx - 1) / rate if rate > 0 else 0
                print(
                    f"    Context: {c_idx+1}/{len(chunks)} "
                    f"({rate:.1f} chunks/s, ~{remaining:.0f}s remaining)"
                )

        # Phase 2: Batch embed all contextualized texts
        print(f"  Embedding {len(contextualized_texts)} chunks in batches of {EMBED_BATCH_SIZE}...")
        all_embeddings = []
        for batch_start in range(0, len(contextualized_texts), EMBED_BATCH_SIZE):
            batch_end = min(batch_start + EMBED_BATCH_SIZE, len(contextualized_texts))
            batch_texts = contextualized_texts[batch_start:batch_end]
            batch_embeddings = batch_embed(batch_texts)
            all_embeddings.extend(batch_embeddings)

        # Phase 3: Ingest into Weaviate
        print(f"  Ingesting into Weaviate...")
        chunk_ok = 0
        chunk_fail = 0

        for c_idx, (chunk, ctx_text, embedding) in enumerate(
            zip(chunks, contextualized_texts, all_embeddings)
        ):
            if embedding is None:
                chunk_fail += 1
                continue

            # Store the contextualized text in the text property
            props = dict(chunk)
            props["text"] = ctx_text

            try:
                docchunk_coll.data.insert(properties=props, vector=embedding)
                chunk_ok += 1
            except Exception as e:
                print(f"    Chunk {chunk['chunk_id']} failed: {e}")
                chunk_fail += 1

        total_ingested += chunk_ok
        total_failed += chunk_fail
        chunks_processed_this_run += len(chunks)
        print(f"  Stored {chunk_ok}/{len(chunks)} chunks ({chunk_fail} failed)")

        # Update checkpoint
        completed.add(name)
        checkpoint["completed_transcripts"] = list(completed)
        checkpoint["total_chunks_ingested"] = total_ingested
        save_checkpoint(checkpoint)

        # Overall progress
        elapsed = time.time() - start_time
        if chunks_processed_this_run > 0:
            rate = chunks_processed_this_run / elapsed
            remaining_chunks = pending_chunks - chunks_processed_this_run
            eta = remaining_chunks / rate if rate > 0 else 0
            print(
                f"  Overall: {chunks_processed_this_run}/{pending_chunks} chunks, "
                f"{elapsed:.0f}s elapsed, ~{eta:.0f}s remaining"
            )

    wclient.close()

    # Final summary
    elapsed_total = time.time() - start_time
    print(f"\n{'=' * 60}")
    print("CONTEXTUAL RETRIEVAL INGESTION COMPLETE")
    print(f"{'=' * 60}")
    print(f"Transcripts processed: {len(completed)}/{len(transcript_data)}")
    print(f"Total chunks ingested: {total_ingested}")
    print(f"Failed chunks: {total_failed}")
    print(f"Time: {elapsed_total:.0f}s ({elapsed_total/60:.1f} minutes)")
    print(f"Collection: {DOCCHUNK_COLLECTION}")
    print(f"Checkpoint saved to: {CHECKPOINT_FILE}")

    # Clean up checkpoint on full completion
    if len(completed) == len(transcript_data):
        print("\nAll transcripts processed. Removing checkpoint file.")
        if CHECKPOINT_FILE.exists():
            CHECKPOINT_FILE.unlink()


if __name__ == "__main__":
    main()
