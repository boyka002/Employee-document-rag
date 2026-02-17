import fs from "fs";
import path from "path";
import { Pinecone } from "@pinecone-database/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GeminiEmbeddings } from "./geminiEmbeddings";
import { v4 as uuidv4 } from "uuid";

// Absolute path to the pdfs/ folder at project root
export const PDFS_DIR = path.join(process.cwd(), "pdfs");

// JSON file that tracks which PDFs have already been ingested
const TRACKER_PATH = path.join(PDFS_DIR, ".ingested.json");

// Chunks to embed + upsert per Pinecone batch
const BATCH_SIZE = 20;

// ── Types ──────────────────────────────────────────────────────────────────

export interface IngestedFile {
  filename: string;
  size: number;
  lastModified: number;
  ingestedAt: string;
  chunkCount: number;
  pageCount: number;
}

interface TrackerData {
  [filename: string]: IngestedFile;
}

// ── Tracker helpers ────────────────────────────────────────────────────────

function loadTracker(): TrackerData {
  try {
    if (fs.existsSync(TRACKER_PATH)) {
      return JSON.parse(fs.readFileSync(TRACKER_PATH, "utf-8")) as TrackerData;
    }
  } catch {
    // Corrupted tracker — start fresh
  }
  return {};
}

function saveTracker(data: TrackerData): void {
  fs.writeFileSync(TRACKER_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/** Returns the list of already-ingested files from the tracker. */
export function getIngestedFiles(): IngestedFile[] {
  return Object.values(loadTracker());
}

// ── Main ingest function ───────────────────────────────────────────────────

/**
 * Scans the pdfs/ folder and ingests any PDF that is new or has changed
 * since the last run (detected by file size + mtime).
 *
 * Already-ingested, unchanged files are skipped to avoid duplicate vectors.
 * Deterministic vector IDs (`<filename>-chunk-<index>`) mean re-ingesting
 * an existing file will upsert (overwrite) rather than duplicate.
 */
export async function ingestAllPdfs(): Promise<void> {
  if (
    !process.env.GOOGLE_API_KEY ||
    !process.env.PINECONE_API_KEY ||
    !process.env.PINECONE_INDEX
  ) {
    console.warn(
      "[RAG] Skipping PDF ingestion — GOOGLE_API_KEY, PINECONE_API_KEY, or PINECONE_INDEX not set."
    );
    return;
  }

  // Ensure the pdfs/ folder exists
  if (!fs.existsSync(PDFS_DIR)) {
    fs.mkdirSync(PDFS_DIR, { recursive: true });
    console.log("[RAG] Created pdfs/ directory. Add PDFs there and restart.");
    return;
  }

  // Collect PDF files
  const pdfFiles = fs
    .readdirSync(PDFS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .map((name) => ({ name, fullPath: path.join(PDFS_DIR, name) }));

  if (pdfFiles.length === 0) {
    console.log("[RAG] No PDFs found in pdfs/ — nothing to ingest.");
    return;
  }

  const tracker = loadTracker();

  // Only process files that are new or have changed
  const toIngest = pdfFiles.filter(({ name, fullPath }) => {
    const stats = fs.statSync(fullPath);
    const record = tracker[name];
    if (!record) return true;
    return record.size !== stats.size || record.lastModified !== stats.mtimeMs;
  });

  if (toIngest.length === 0) {
    const names = pdfFiles.map((f) => f.name).join(", ");
    console.log(`[RAG] All PDFs already ingested (${names}). Skipping.`);
    return;
  }

  console.log(`[RAG] Ingesting ${toIngest.length} PDF(s)...`);

  // ── Shared resources ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse") as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getText(): Promise<{ text: string; total: number }>;
    };
  };

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const embedder = new GeminiEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    modelName: "gemini-embedding-001",
    outputDimensionality: 1024,
  });

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const index = pinecone.Index(process.env.PINECONE_INDEX!);

  // ── Process each PDF ──────────────────────────────────────────────────────
  for (const { name, fullPath } of toIngest) {
    console.log(`[RAG] ▶ Processing: ${name}`);

    try {
      const buffer = fs.readFileSync(fullPath);
      const stats = fs.statSync(fullPath);

      // Extract text
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const { text: rawText, total: pageCount } = await parser.getText();

      if (!rawText || rawText.trim().length === 0) {
        console.warn(`[RAG]   Skipping ${name} — no extractable text.`);
        continue;
      }

      // Split into chunks
      const chunks = (await splitter.splitText(rawText)).filter(
        (c) => c.trim().length > 0
      );

      if (chunks.length === 0) {
        console.warn(`[RAG]   Skipping ${name} — zero chunks after splitting.`);
        continue;
      }

      // Embed + upsert in batches
      const ingestedAt = new Date().toISOString();
      let upserted = 0;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const vectors = await embedder.embedDocuments(batch);

        const records = batch.map((text, j) => ({
          // Deterministic ID — re-ingesting the same file overwrites existing vectors
          id: `${name.replace(/[^a-zA-Z0-9-_]/g, "_")}-chunk-${i + j}`,
          values: vectors[j],
          metadata: {
            text,
            source: name,
            chunkIndex: i + j,
            totalChunks: chunks.length,
            ingestedAt,
          },
        }));

        await index.upsert(records);
        upserted += records.length;
      }

      // Persist to tracker
      tracker[name] = {
        filename: name,
        size: stats.size,
        lastModified: stats.mtimeMs,
        ingestedAt,
        chunkCount: upserted,
        pageCount,
      };
      saveTracker(tracker);

      console.log(
        `[RAG] ✓ ${name}: ${upserted} chunks across ${pageCount} page(s)`
      );
    } catch (err) {
      console.error(
        `[RAG] ✗ Failed to ingest ${name}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log("[RAG] Ingestion complete.");
}
