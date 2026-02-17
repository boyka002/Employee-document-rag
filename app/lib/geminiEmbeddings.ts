import { Embeddings } from "@langchain/core/embeddings";

// Shape of the Gemini embedContent REST response
interface EmbedContentResponse {
  embedding?: { values: number[] };
  error?: { code: number; message: string; status: string };
}

/**
 * Custom LangChain-compatible Embeddings class that calls the Gemini
 * REST API directly instead of using @langchain/google-genai.
 *
 * Why not use GoogleGenerativeAIEmbeddings from @langchain/google-genai?
 * - Its batchEmbedContents() silently swallows API errors and fills
 *   failures with [] vectors, producing "dimension 0" Pinecone errors.
 * - It doesn't expose the outputDimensionality parameter.
 *
 * This class:
 * - Calls embedContent via fetch (full access to all REST params)
 * - Supports outputDimensionality to match any Pinecone index dimension
 * - Throws real errors on API failure so bugs are visible
 */
export class GeminiEmbeddings extends Embeddings {
  private apiKey: string;
  private modelName: string;
  private outputDimensionality: number;

  constructor(options: {
    apiKey: string;
    modelName?: string;
    outputDimensionality?: number;
  }) {
    super({});
    this.apiKey = options.apiKey;
    this.modelName = options.modelName ?? "gemini-embedding-001";
    // gemini-embedding-001 supports 1–3072 dims.
    // Default 1024 to match common Pinecone index setups.
    this.outputDimensionality = options.outputDimensionality ?? 1024;
  }

  /** Embed a single query string via the Gemini REST API. */
  async embedQuery(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:embedContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }], role: "user" },
        outputDimensionality: this.outputDimensionality,
      }),
    });

    const data: EmbedContentResponse = await res.json();

    if (!res.ok || data.error) {
      throw new Error(
        `Gemini embedContent failed (${res.status}): ${data.error?.message ?? "unknown error"}`
      );
    }

    const values = data.embedding?.values;
    if (!values || values.length === 0) {
      throw new Error(
        `Gemini embedContent returned an empty vector for: "${text.slice(0, 60)}"`
      );
    }

    return values;
  }

  /** Embed an array of documents (sequentially to avoid rate limits). */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const doc of documents) {
      results.push(await this.embedQuery(doc));
    }
    return results;
  }
}
