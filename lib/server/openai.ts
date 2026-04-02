import OpenAI from "openai";
import { env } from "./env";

let _oai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_oai) return _oai;
  if (!env.OPENAI_API_KEY || !env.OPENAI_API_KEY.startsWith("sk-")) {
    throw new Error("Service temporarily unavailable.");
  }
  _oai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _oai;
}
