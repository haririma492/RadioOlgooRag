export type VideoRow = {
  video_code: string;
  title: string;
  category: string;
  speakers: string[];
  video_date: string;
  video_url: string;
  external_details_url: string;
  year: string;
  photo_url: string | null;
  summary: string;
};

// Keep old name as alias for compatibility during transition
export type PanelRow = VideoRow;

export type ChunkRow = {
  rank: number;
  text: string;
  file_name?: string;
  chunk_start_time?: string;
  chunk_speakers?: string;
  video_category?: string;
  video_code?: string;
  doc_id?: string;
};

export type VideoResult = {
  video_code: string;
  video_meta: VideoRow | null;
  chunks: ChunkRow[];
};

// Keep old name as alias
export type PanelResult = VideoResult;
