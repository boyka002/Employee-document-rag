import { NextResponse } from "next/server";
import fs from "fs";
import { getIngestedFiles, PDFS_DIR } from "@/app/lib/ingestPdfs";

/**
 * GET /api/status
 * Returns the list of PDFs in the pdfs/ folder along with their ingestion state.
 */
export async function GET() {
  try {
    // All PDF filenames present on disk
    const onDisk: string[] = fs.existsSync(PDFS_DIR)
      ? fs
          .readdirSync(PDFS_DIR)
          .filter((f) => f.toLowerCase().endsWith(".pdf"))
      : [];

    // All files that have been successfully ingested
    const ingested = getIngestedFiles();
    const ingestedNames = new Set(ingested.map((f) => f.filename));

    // Merge: mark each disk file as ingested or pending
    const files = onDisk.map((filename) => {
      const record = ingested.find((f) => f.filename === filename);
      return record
        ? { ...record, status: "ingested" as const }
        : { filename, status: "pending" as const };
    });

    return NextResponse.json({
      totalOnDisk: onDisk.length,
      totalIngested: ingestedNames.size,
      files,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to read PDF status",
      },
      { status: 500 }
    );
  }
}
