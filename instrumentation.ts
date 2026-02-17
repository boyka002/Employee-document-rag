/**
 * Next.js Instrumentation file — runs once when the server starts.
 *
 * This is where we kick off automatic PDF ingestion so that every PDF
 * placed in the pdfs/ folder is indexed into Pinecone before the first
 * user request arrives.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run in the Node.js runtime (not in the Edge runtime or during the
  // build phase where file-system access is not available).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ingestAllPdfs } = await import("./app/lib/ingestPdfs");
    await ingestAllPdfs();
  }
}
