"use client";

import { useState } from "react";

// Helper functions from AnalysisPanel
function getIssueStage(ruleId?: string): string {
  if (!ruleId) return "stage1-2";
  if (ruleId.startsWith("pattern_")) return "stage4";
  if (ruleId.startsWith("cross_doc_")) return "stage3-cross";
  if (ruleId.startsWith("risk_matrix_")) return "stage3-risk";
  if (ruleId.startsWith("structured_")) return "stage3-structured";
  return "stage1-2";
}

function severityBorder(sev: string, ruleId?: string) {
  const stage = getIssueStage(ruleId);
  if (stage === "stage3-structured") return "border-l-blue-500";
  if (stage === "stage3-risk") return "border-l-purple-500";
  if (stage === "stage3-cross") return "border-l-cyan-500";
  if (stage === "stage4") return "border-l-purple-500";
  if (sev === "error") return "border-l-red-500";
  if (sev === "warn") return "border-l-orange-500";
  return "border-l-slate-400";
}

function severityColor(sev: string, ruleId?: string) {
  const stage = getIssueStage(ruleId);
  if (stage === "stage3-structured") return "text-blue-600";
  if (stage === "stage3-risk") return "text-purple-600";
  if (stage === "stage3-cross") return "text-cyan-600";
  if (stage === "stage4") return "text-purple-600";
  if (sev === "error") return "text-red-600 dark:text-red-400";
  if (sev === "warn") return "text-orange-600 dark:text-orange-400";
  return "text-slate-600 dark:text-slate-400";
}

function severityIcon(sev: string, ruleId?: string) {
  const stage = getIssueStage(ruleId);
  if (stage === "stage3-structured") return "verified_user";
  if (stage === "stage3-risk") return "analytics";
  if (stage === "stage3-cross") return "timeline";
  if (stage === "stage4") return "query_stats";
  if (sev === "error") return "error";
  if (sev === "warn") return "warning";
  return "info";
}

function avatarBgColor(ruleId?: string) {
  const stage = getIssueStage(ruleId);
  if (stage === "stage3-structured") return "bg-blue-100 dark:bg-blue-900/30";
  if (stage === "stage3-risk") return "bg-purple-100 dark:bg-purple-900/30";
  if (stage === "stage3-cross") return "bg-cyan-100 dark:bg-cyan-900/30";
  if (stage === "stage4") return "bg-purple-100 dark:bg-purple-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

function avatarColor(ruleId?: string) {
  const stage = getIssueStage(ruleId);
  if (stage === "stage3-structured") return "text-blue-600 dark:text-blue-400";
  if (stage === "stage3-risk") return "text-purple-600 dark:text-purple-400";
  if (stage === "stage3-cross") return "text-cyan-600 dark:text-cyan-400";
  if (stage === "stage4") return "text-purple-600 dark:text-purple-400";
  return "text-red-600 dark:text-red-400";
}

interface Issue {
  id: string;
  severity: "error" | "warn" | "info";
  title: string;
  message: string;
  ruleId?: string;
  confidence?: number;
  isAIFixable?: boolean; // Whether AI can suggest a fix (false for photos, signatures)
}

interface IssuesListProps {
  issues: Issue[];
  loading?: boolean;
  onConfirm?: (id: string) => void;
  onFix?: (issue: Issue) => void;
  processingIssueId?: string | null;
  hasUnviewedIssues?: boolean;
  isAnimating?: boolean;
  onMarkIssuesViewed?: () => void;
}

export function IssuesList({ issues, loading, onConfirm, onFix, processingIssueId, hasUnviewedIssues = false, isAnimating = false, onMarkIssuesViewed }: IssuesListProps) {
  const [hiddenIssueIds, setHiddenIssueIds] = useState<Set<string>>(new Set());

  // Mark issues as viewed when user interacts with the list
  const markViewed = () => {
    if (hasUnviewedIssues && onMarkIssuesViewed) {
      onMarkIssuesViewed();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 dark:border-slate-700 border-t-primary mx-auto mb-4"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400">분석 중...</p>
        </div>
      </div>
    );
  }

  const visibleIssues = issues.filter((i) => !hiddenIssueIds.has(i.id));

  if (visibleIssues.length === 0 && issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-green-500 mb-4">check_circle</span>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">문제 없음</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            검증 결과 발견된 문제가 없습니다
          </p>
        </div>
      </div>
    );
  }

  const handleConfirm = (id: string) => {
    setHiddenIssueIds((prev) => new Set(prev).add(id));
    if (onConfirm) onConfirm(id);
  };

  const handleFix = (issue: Issue) => {
    if (onFix) onFix(issue);
  };

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;
  const totalCount = issues.length;

  // Determine header badge color based on severity
  const headerBadgeColor = errorCount > 0
    ? "bg-red-500"
    : warnCount > 0
      ? "bg-orange-500"
      : "bg-blue-500";

  return (
    <div
      className={`flex flex-col h-full transition-all duration-500 ${
        isAnimating
          ? "bg-blue-100 dark:bg-blue-900/40 ring-4 ring-blue-500 shadow-lg shadow-blue-500/50"
          : "bg-slate-50 dark:bg-slate-900"
      }`}
      onClick={markViewed}
    >
      {/* Header with Title and Badge */}
      <div className={`px-4 py-3 border-b transition-all duration-500 ${
        isAnimating
          ? "bg-blue-200 dark:bg-blue-800/50 border-blue-300 dark:border-blue-700"
          : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">발견된 문제</h2>
            {totalCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white ${headerBadgeColor} ${
                isAnimating ? "animate-bounce" : ""
              }`}>
                {totalCount}
              </span>
            )}
            {hasUnviewedIssues && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {visibleIssues.length} / {issues.length}
          </span>
        </div>

        {/* Severity Summary */}
        <div className="flex items-center gap-2 flex-wrap">
          {errorCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30">
              <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-sm">error</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">{errorCount}</span>
            </div>
          )}
          {warnCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30">
              <span className="material-symbols-outlined text-orange-600 dark:text-orange-400 text-sm">warning</span>
              <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{warnCount}</span>
            </div>
          )}
          {infoCount > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-sm">info</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{infoCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* Issues List - Chat-style cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {visibleIssues.map((issue, idx) => (
          <div key={issue.id} className="flex gap-2">
            <div className={`size-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${avatarBgColor(issue.ruleId)}`}>
              <span className={`material-symbols-outlined text-base ${avatarColor(issue.ruleId)}`}>
                {severityIcon(issue.severity, issue.ruleId)}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div
                className={`bg-white dark:bg-slate-800 p-3 rounded-lg rounded-tl-none shadow-sm border-l-4 ${severityBorder(
                  issue.severity,
                  issue.ruleId
                )}`}
              >
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h4 className={`font-bold text-sm flex items-center gap-1.5 ${severityColor(issue.severity, issue.ruleId)}`}>
                    <span className="material-symbols-outlined text-base">{severityIcon(issue.severity, issue.ruleId)}</span>
                    {issue.title}
                  </h4>
                  {issue.confidence !== undefined && (
                    <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-slate-500 whitespace-nowrap">
                      {issue.confidence}%
                    </span>
                  )}
                </div>

                <p className="text-xs leading-relaxed mb-3 whitespace-pre-line text-slate-700 dark:text-slate-300">
                  {issue.message}
                </p>

                <div className={`grid gap-1.5 ${issue.isAIFixable === false ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <button
                    onClick={() => handleConfirm(issue.id)}
                    className="py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold"
                  >
                    확인했어
                  </button>
                  {issue.isAIFixable !== false && (
                    <button
                      onClick={() => handleFix(issue)}
                      disabled={processingIssueId === issue.id}
                      className="py-2 bg-primary hover:bg-green-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {processingIssueId === issue.id ? (
                        <>
                          <span className="animate-spin material-symbols-outlined text-xs">refresh</span>
                          생성 중
                        </>
                      ) : (
                        "수정해줘"
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
