
import weaviate from "weaviate-ts-client";
import type { WeaviateClient } from "weaviate-ts-client";




import { env } from "./env";

let _client: WeaviateClient | null = null;

export function getWeaviateClient(): WeaviateClient {
  if (_client) return _client;

  if (!env.WEAVIATE_URL || !env.WEAVIATE_API_KEY) {
    throw new Error("Missing WEAVIATE_URL / WEAVIATE_API_KEY");
  }

  const host = env.WEAVIATE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

  _client = weaviate.client({
    scheme: "https",
    host,
    apiKey: new (weaviate as any).ApiKey(env.WEAVIATE_API_KEY),
  });

  return _client;
}
