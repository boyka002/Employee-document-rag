import { NextRequest, NextResponse } from "next/server";
import { GeminiEmbeddings } from "@/app/lib/geminiEmbeddings";
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Number of similar chunks to retrieve
const TOP_K = 4;

// Metadata stored alongside each Pinecone vector at ingest time
interface ChunkMetadata {
  text?: string;
  source?: string;
  chunkIndex?: number;
  uploadedAt?: string;
}

/**
 * POST /api/query
 * Accepts a user question, retrieves relevant chunks from Pinecone,
 * and generates a grounded answer with Gemini.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question } = body;

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "A valid question string is required" },
        { status: 400 }
      );
    }

    if (question.trim().length > 2000) {
      return NextResponse.json(
        { error: "Question is too long (max 2000 characters)" },
        { status: 400 }
      );
    }

    // Validate env vars
    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY is not configured" },
        { status: 500 }
      );
    }
    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) {
      return NextResponse.json(
        { error: "Pinecone credentials are not configured" },
        { status: 500 }
      );
    }

    const trimmedQuestion = question.trim();

    // ── 1. Embed the question ────────────────────────────────────────────
    const embedder = new GeminiEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      modelName: "gemini-embedding-001",
      outputDimensionality: 1024,
    });

    const questionVector = await embedder.embedQuery(trimmedQuestion);

    // ── 2. Retrieve top-K similar chunks from Pinecone ───────────────────
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.Index(process.env.PINECONE_INDEX);

    const queryResponse = await index.query({
      vector: questionVector,
      topK: TOP_K,
      includeMetadata: true,
    });

    const matches = queryResponse.matches ?? [];

    if (matches.length === 0) {
      return NextResponse.json({
        success: true,
        answer:
          "No relevant content was found in the uploaded documents. Please upload a PDF first.",
        sources: [],
        retrievedChunks: 0,
      });
    }

    // ── 3. Build context from retrieved chunks ────────────────────────────
    const context = matches
      .map((m) => (m.metadata as ChunkMetadata)?.text ?? "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    // ── 4. Generate answer with Gemini ────────────────────────────────────
    const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const llm = genai.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.7 },  // higher = warmer, more natural tone
    });

    const prompt = `You are a friendly, knowledgeable assistant helping someone understand their documents. \
Think of yourself as a helpful colleague — warm, clear, and approachable.

Guidelines:
- Answer naturally and conversationally, like you're chatting with a colleague.
- Keep your answer grounded in the document context below — don't make up facts.
- You can use everyday language, contractions, and a light touch of personality.
- If the answer has multiple parts, use short bullet points or numbered steps to keep it readable.
- If the context genuinely doesn't have the answer, say something like: \
  "Hmm, I don't see anything about that in the documents — could you rephrase, or is there another doc I should check?"
- Never sound robotic or list out raw text verbatim — always explain in your own words.

Context from the documents:
${context}

Question: ${trimmedQuestion}

Answer:`;

    const result = await llm.generateContent(prompt);
    const answer = result.response.text();

    // ── 5. Build deduplicated source list ─────────────────────────────────
    const sources: ChunkMetadata[] = matches.map((m) => ({
      source: (m.metadata as ChunkMetadata)?.source,
      chunkIndex: (m.metadata as ChunkMetadata)?.chunkIndex,
      uploadedAt: (m.metadata as ChunkMetadata)?.uploadedAt,
    }));

    // Deduplicate by source filename
    const uniqueSources = Array.from(
      new Map(sources.map((s) => [s.source, s])).values()
    );

    return NextResponse.json({
      success: true,
      answer,
      sources: uniqueSources,
      retrievedChunks: matches.length,
    });
  } catch (error) {
    console.error("Query error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while processing your question",
      },
      { status: 500 }
    );
  }
}
