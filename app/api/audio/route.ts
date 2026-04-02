import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const MP3_DIR = path.resolve(
  process.cwd(),
  "../../RadioOlgooStart/rp_english_mp3s"
);

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file) {
    return NextResponse.json({ error: "Missing ?file= param" }, { status: 400 });
  }

  // Sanitize: only allow .mp3, no path traversal
  const safeName = path.basename(file);
  if (!safeName.endsWith(".mp3")) {
    return NextResponse.json({ error: "Only .mp3 files" }, { status: 400 });
  }

  const filePath = path.join(MP3_DIR, safeName);
  if (!existsSync(filePath)) {
    // Try fuzzy match: transcript filename → mp3 filename
    // The transcript .txt name should match the mp3 name
    return NextResponse.json(
      { error: `File not found: ${safeName}` },
      { status: 404 }
    );
  }

  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buffer.length),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
