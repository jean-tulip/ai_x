"use client";

import { useEffect, useState, useRef } from "react";
import { DocumentTypeBadge } from "./DocumentTypeBadge";

interface RecentDocument {
  id: string;
  fileName: string;
  createdAt: string;
  documentType?: string | null;
}

interface RecentDocumentsProps {
  currentProjectId: string | null;
  currentReportId?: string; // ID of currently displayed report to highlight it
  onSelectDocument: (id: string) => void;
  maxItems?: number;
  mode?: "full" | "compact"; // New prop for hybrid behavior
}

export function RecentDocuments({ currentProjectId, currentReportId, onSelectDocument, maxItems = 4, mode = "compact" }: RecentDocumentsProps) {
  const [documents, setDocuments] = useState<RecentDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(() => {
    // Remember collapse state in localStorage (only for compact mode)
    if (typeof window !== "undefined" && mode === "compact") {
      const saved = localStorage.getItem("recentDocuments_expanded");
      return saved === "true";
    }
    return true; // Default expanded for full mode
  });
  const cacheRef = useRef<Map<string, RecentDocument[]>>(new Map());

  // Save expand/collapse state
  useEffect(() => {
    if (mode === "compact") {
      localStorage.setItem("recentDocuments_expanded", String(isExpanded));
    }
  }, [isExpanded, mode]);

  useEffect(() => {
    async function fetchDocuments() {
      if (!currentProjectId) {
        setDocuments([]);
        return;
      }

      // Check cache first
      const cacheKey = `${currentProjectId}_${maxItems}`;
      if (cacheRef.current.has(cacheKey)) {
        setDocuments(cacheRef.current.get(cacheKey)!);
        return;
      }

      setLoading(true);
      try {
        const url = `/api/history?projectId=${currentProjectId}`;
        const res = await fetch(url);
        if (res.ok) {
          const history = await res.json();
          if (Array.isArray(history)) {
            const sliced = history.slice(0, maxItems);
            setDocuments(sliced);
            // Cache the result
            cacheRef.current.set(cacheKey, sliced);
          }
        }
      } catch (e) {
        console.error("Failed to fetch recent documents", e);
      } finally {
        setLoading(false);
      }
    }

    fetchDocuments();
  }, [currentProjectId, maxItems]);

  if (!currentProjectId || documents.length === 0) {
    return null;
  }

  // Full mode - for empty state (always expanded, no collapse button)
  if (mode === "full") {
    return (
      <div className="w-full bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-blue-500 dark:text-blue-400">
            history
          </span>
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            최근 작업 문서
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            클릭하여 이어서 작업
          </span>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2">
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-48 h-20 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse"
                />
              ))}
            </>
          ) : (
            documents.map((doc) => {
              const isActive = currentReportId === doc.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className={`flex-shrink-0 w-52 p-3 rounded-xl border-2 transition-all text-left ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-500"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-lg flex-shrink-0">
                      description
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 dark:text-white truncate mb-0.5">
                        {doc.fileName}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {new Date(doc.createdAt).toLocaleDateString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                  {doc.documentType && (
                    <DocumentTypeBadge type={doc.documentType} size="sm" showIcon={false} />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Compact mode - for when document is loaded (collapsible)
  return (
    <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
      {/* Compact Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-lg">
            history
          </span>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            최근 문서 {documents.length}개
          </span>
        </div>
        <span className={`material-symbols-outlined text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>

      {/* Expandable Cards */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {loading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-48 h-20 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse"
                  />
                ))}
              </>
            ) : (
              documents.map((doc) => {
                const isActive = currentReportId === doc.id;
                return (
                  <button
                    key={doc.id}
                    onClick={() => onSelectDocument(doc.id)}
                    className={`flex-shrink-0 w-48 p-2.5 rounded-lg border-2 transition-all text-left ${
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-500"
                        : "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-lg flex-shrink-0">
                        description
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-800 dark:text-white truncate mb-0.5">
                          {doc.fileName}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {new Date(doc.createdAt).toLocaleDateString("ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    {doc.documentType && (
                      <DocumentTypeBadge type={doc.documentType} size="sm" showIcon={false} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
