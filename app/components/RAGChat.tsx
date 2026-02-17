"use client";

import { useState, useEffect, FormEvent } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface PDFFile {
  filename: string;
  status: "ingested" | "pending";
  chunkCount?: number;
  pageCount?: number;
  ingestedAt?: string;
}

interface StatusResponse {
  totalOnDisk: number;
  totalIngested: number;
  files: PDFFile[];
  error?: string;
}

interface Source {
  source?: string;
  chunkIndex?: number;
  uploadedAt?: string;
}

interface QueryResponse {
  success?: boolean;
  answer?: string;
  sources?: Source[];
  retrievedChunks?: number;
  error?: string;
}

type QueryStatus = "idle" | "loading" | "success" | "error";

// ── Component ──────────────────────────────────────────────────────────────

export default function RAGChat() {
  // PDF status
  const [pdfStatus, setPdfStatus] = useState<StatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Query
  const [question, setQuestion] = useState("");
  const [queryStatus, setQueryStatus] = useState<QueryStatus>("idle");
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);

  // Load PDF status on mount
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data: StatusResponse) => {
        setPdfStatus(data);
        setStatusLoading(false);
      })
      .catch(() => {
        setPdfStatus({ totalOnDisk: 0, totalIngested: 0, files: [], error: "Could not reach /api/status" });
        setStatusLoading(false);
      });
  }, []);

  // Submit question
  const handleQuery = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim() || queryStatus === "loading") return;

    setQueryStatus("loading");
    setQueryResult(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data: QueryResponse = await res.json();
      setQueryStatus(res.ok && !data.error ? "success" : "error");
      setQueryResult(data);
    } catch {
      setQueryStatus("error");
      setQueryResult({ error: "Network error — please try again." });
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── Header ── */}
        <header className="text-center space-y-2 pt-4">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-400 text-sm font-medium mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            Powered by Gemini · Pinecone
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Document Q&amp;A
          </h1>
          <p className="text-slate-400 text-lg">
            Ask questions about your loaded PDF documents
          </p>
        </header>

        {/* ── Loaded PDFs panel ── */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h2 className="text-base font-semibold text-white">Loaded Documents</h2>
            </div>

            {!statusLoading && pdfStatus && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                pdfStatus.totalIngested > 0
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
              }`}>
                {pdfStatus.totalIngested} / {pdfStatus.totalOnDisk} indexed
              </span>
            )}
          </div>

          {statusLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Checking indexed documents…
            </div>
          ) : pdfStatus?.error ? (
            <p className="text-red-400 text-sm">{pdfStatus.error}</p>
          ) : pdfStatus?.files.length === 0 ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-sm text-amber-300">
              <p className="font-semibold mb-1">No PDFs found</p>
              <p className="text-amber-400/70">
                Add PDF files to the <code className="px-1 py-0.5 rounded bg-slate-700 text-amber-300 font-mono text-xs">pdfs/</code> folder at the project root, then restart the server.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pdfStatus!.files.map((f) => (
                <li key={f.filename} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-slate-700/40 border border-slate-600/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm text-slate-200 truncate font-medium">{f.filename}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {f.status === "ingested" ? (
                      <>
                        <span className="text-xs text-slate-500">{f.chunkCount} chunks</span>
                        {f.pageCount && <span className="text-xs text-slate-600">· {f.pageCount}p</span>}
                        <span className="text-xs text-slate-600">{formatDate(f.ingestedAt)}</span>
                        <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Ready
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Pending restart
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-slate-600">
            Documents are auto-indexed from <code className="px-1 py-0.5 rounded bg-slate-700/60 font-mono text-slate-500">pdfs/</code> when the server starts. Restart the server after adding new PDFs.
          </p>
        </section>

        {/* ── Query section ── */}
        <section className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">Ask a Question</h2>
          </div>

          <form onSubmit={handleQuery} className="space-y-4">
            <div className="relative">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    if (question.trim() && queryStatus !== "loading") {
                      handleQuery(e as unknown as FormEvent);
                    }
                  }
                }}
                placeholder="Ask anything about the loaded documents…"
                rows={3}
                maxLength={2000}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 resize-none text-sm transition-colors"
              />
              <span className="absolute bottom-3 right-3 text-xs text-slate-600">
                {question.length}/2000
              </span>
            </div>

            <button
              type="submit"
              disabled={!question.trim() || queryStatus === "loading" || pdfStatus?.totalIngested === 0}
              className={`
                w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200
                ${
                  !question.trim() || queryStatus === "loading" || pdfStatus?.totalIngested === 0
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 active:scale-[0.98]"
                }
              `}
            >
              {queryStatus === "loading" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching documents…
                </span>
              ) : (
                "Ask Question"
              )}
            </button>

            <p className="text-xs text-slate-600 text-center">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono text-xs">Ctrl+Enter</kbd> to submit
            </p>
          </form>

          {/* Answer */}
          {queryResult && (
            <div className="mt-6 space-y-4">
              {queryStatus === "error" ? (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {queryResult.error}
                </div>
              ) : (
                <>
                  <div className="p-5 rounded-xl bg-slate-700/40 border border-slate-600/50">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <span className="text-slate-300 font-semibold text-sm">Answer</span>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-sm whitespace-pre-wrap">
                      {queryResult.answer}
                    </p>
                  </div>

                  {queryResult.sources && queryResult.sources.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Sources · {queryResult.retrievedChunks} chunk{queryResult.retrievedChunks !== 1 ? "s" : ""} retrieved
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {queryResult.sources.map((s, i) => (
                          <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600/50 text-xs text-slate-400">
                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="font-medium text-slate-300">{s.source ?? "Unknown"}</span>
                            {s.uploadedAt && (
                              <span className="text-slate-600">· {formatDate(s.uploadedAt)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-600 pb-4">
          gemini-embedding-001 · gemini-2.5-flash · Pinecone
        </footer>
      </div>
    </div>
  );
}
