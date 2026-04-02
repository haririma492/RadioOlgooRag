export const env = {
  WEAVIATE_URL: process.env.WEAVIATE_URL || "",
  WEAVIATE_API_KEY: process.env.WEAVIATE_API_KEY || "",
  WEAVIATE_PANELS_COLLECTION: process.env.WEAVIATE_PANELS_COLLECTION || "Olgoo_Videos",
  WEAVIATE_DOCCHUNKS_COLLECTION: process.env.WEAVIATE_DOCCHUNKS_COLLECTION || "Olgoo_DocChunk",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  CSPC_DEBUG: (process.env.CSPC_DEBUG || "No").trim().toUpperCase(),
  S3_BUCKET: process.env.S3_BUCKET || "olgoo-radio-assets-548182874392",
  S3_REGION: process.env.S3_REGION || "ca-central-1",
  S3_AUDIO_PREFIX: process.env.S3_AUDIO_PREFIX || "media",
};
export const isDebug = ["YES","TRUE","1","ON"].includes(env.CSPC_DEBUG);
export const S3_BASE_URL = `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
