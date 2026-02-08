"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface TBMRecord {
  id: string;
  createdAt: string;
  tbmSummary: string;
  tbmTranscript: string;
  tbmWorkType: string | null;
  tbmExtractedHazards: string | null;
  tbmExtractedInspector: string | null;
  tbmParticipants: string | null;
  tbmDuration: number | null;
  tbmCompletenessJson?: string | null;
  // Brief #3: Engagement quality scoring
  tbmEngagementJson?: string | null;
}

interface CompletenessScore {
  score: number;
  level: "excellent" | "adequate" | "insufficient";
  breakdown?: {
    workDescription: boolean;
    hazardIdentification: boolean;
    controlMeasures: boolean;
    ppeDiscussion: boolean;
    roleAssignment: boolean;
    emergencyPlan: boolean;
    workerParticipation: boolean;
  };
  missingTopics?: string[];
  suggestions?: string[];
}

// Brief #3: Engagement quality scoring interface
interface EngagementScore {
  score: number;
  level: "high" | "medium" | "low";
  levelKo: string;
  factors: Array<{
    name: string;
    nameKo: string;
    detected: boolean;
    impact: number;
    evidence?: string;
  }>;
  suggestions: string[];
}

interface TBMTimelineProps {
  tbmRecords: TBMRecord[];
  loading: boolean;
  onSelectTBM: (record: TBMRecord) => void;
  onRefresh: () => void;
  onDelete?: (id: string) => void;
  onDeleteAll?: () => void;
}

export default function TBMTimeline({ tbmRecords, loading, onSelectTBM, onRefresh, onDelete, onDeleteAll }: TBMTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "single" | "all"; id?: string } | null>(null);
  // Track if we've ever finished loading - prevents showing empty state before first load completes
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    console.log("[TBMTimeline] Received records:", tbmRecords.length, "loading:", loading);
    // Mark as loaded once when loading finishes (regardless of whether records exist)
    if (!loading && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [tbmRecords, loading, hasLoadedOnce]);

  // Clear expandedId if the expanded record no longer exists
  useEffect(() => {
    if (expandedId && !tbmRecords.some(r => r.id === expandedId)) {
      setExpandedId(null);
    }
  }, [tbmRecords, expandedId]);

  const parseJsonField = (field: string | null): any[] => {
    if (!field) return [];
    try {
      return JSON.parse(field);
    } catch {
      return [];
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getHazardColor = (hazard: string) => {
    if (hazard.includes("추락") || hazard.includes("낙하")) return "bg-red-100 text-red-800";
    if (hazard.includes("화재") || hazard.includes("폭발")) return "bg-orange-100 text-orange-800";
    if (hazard.includes("감전") || hazard.includes("전기")) return "bg-yellow-100 text-yellow-800";
    if (hazard.includes("밀폐") || hazard.includes("질식")) return "bg-purple-100 text-purple-800";
    if (hazard.includes("충돌") || hazard.includes("협착")) return "bg-blue-100 text-blue-800";
    return "bg-gray-100 text-gray-800";
  };

  const parseCompleteness = (json: string | null | undefined): CompletenessScore | null => {
    if (!json) return null;
    try {
      return JSON.parse(json) as CompletenessScore;
    } catch {
      return null;
    }
  };

  const getCompletenessColor = (level: string) => {
    switch (level) {
      case "excellent":
        return "bg-green-100 text-green-800 border-green-300";
      case "adequate":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "insufficient":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getCompletenessLevelKo = (level: string) => {
    switch (level) {
      case "excellent":
        return "우수";
      case "adequate":
        return "적정";
      case "insufficient":
        return "미흡";
      default:
        return level;
    }
  };

  // Brief #3: Engagement score parsing and helpers
  const parseEngagement = (json: string | null | undefined): EngagementScore | null => {
    if (!json) return null;
    try {
      return JSON.parse(json) as EngagementScore;
    } catch {
      return null;
    }
  };

  const getEngagementColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-green-100 text-green-800 border-green-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "low":
        return "bg-red-100 text-red-800 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getEngagementBgColor = (level: string) => {
    switch (level) {
      case "high":
        return "bg-green-50 border-green-200";
      case "medium":
        return "bg-yellow-50 border-yellow-200";
      case "low":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  // Track if we're mounted in browser for portal
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Render the confirmation dialog via portal to avoid DOM tree conflicts
  // when the main content switches between timeline and empty state
  const renderConfirmDialog = () => {
    if (!confirmDelete || !mounted) return null;

    return createPortal(
      <ConfirmDialog
        key={`confirm-${confirmDelete.type}-${confirmDelete.id || 'all'}`}
        isOpen={true}
        onClose={() => setConfirmDelete(null)}
        closeOnConfirm={false}
        onConfirm={() => {
          // Capture values before clearing state
          const deleteType = confirmDelete?.type;
          const deleteId = confirmDelete?.id;

          // Clear expanded state
          if (deleteType === "single" && deleteId && expandedId === deleteId) {
            setExpandedId(null);
          } else if (deleteType === "all") {
            setExpandedId(null);
          }

          // Close dialog FIRST, then execute delete
          // This ensures the portal is cleanly unmounted before DOM changes from delete
          setConfirmDelete(null);

          // Execute delete after dialog state is cleared
          setTimeout(() => {
            if (deleteType === "single" && deleteId) {
              onDelete?.(deleteId);
            } else if (deleteType === "all") {
              onDeleteAll?.();
            }
          }, 0);
        }}
        title={confirmDelete.type === "all" ? "전체 삭제 확인" : "삭제 확인"}
        message={
          confirmDelete.type === "all"
            ? `총 ${tbmRecords.length}개의 TBM 기록을 모두 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
            : "이 TBM 기록을 삭제하시겠습니까?"
        }
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
      />,
      document.body
    );
  };

  // Show loading state if loading OR if we haven't loaded once yet
  if (loading || !hasLoadedOnce) {
    return (
      <>
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500">TBM 기록을 불러오는 중...</div>
        </div>
        {renderConfirmDialog()}
      </>
    );
  }

  if (tbmRecords.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="text-6xl mb-4">🎤</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">TBM 기록이 없습니다</h3>
          <p className="text-gray-600 mb-4">
            상단의 마이크 버튼을 클릭하여 작업 전 안전회의를 녹음하세요.
            <br />
            AI가 자동으로 작업 종류, 위험요인, 담당자를 추출합니다.
          </p>
          <div className="text-sm text-gray-500">
            💡 녹음 후 이 탭으로 자동 이동됩니다
          </div>
        </div>
        {renderConfirmDialog()}
      </>
    );
  }

  return (
    <>
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white">TBM 타임라인</h2>
          <div className="flex items-center gap-2">
            {onDeleteAll && tbmRecords.length > 0 && (
              <button
                onClick={() => setConfirmDelete({ type: "all" })}
                className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition flex items-center gap-1"
                title="모든 기록 삭제"
              >
                <span className="material-symbols-outlined text-lg">delete_sweep</span>
                <span className="hidden sm:inline">전체 삭제</span>
              </button>
            )}
            <button
              onClick={onRefresh}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              title="목록 새로고침"
            >
              <span className="material-symbols-outlined text-xl">refresh</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {tbmRecords.map((record) => {
            const hazards = parseJsonField(record.tbmExtractedHazards);
            const participants = parseJsonField(record.tbmParticipants);
            const isExpanded = expandedId === record.id;
            const completeness = parseCompleteness(record.tbmCompletenessJson);
            const engagement = parseEngagement(record.tbmEngagementJson);

            return (
              <div
                key={record.id}
                className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500">{formatDate(record.createdAt)}</span>
                        {record.tbmDuration && (
                          <span className="text-xs text-gray-500">
                            ⏱️ {formatDuration(record.tbmDuration)}
                          </span>
                        )}
                        {/* Completeness Badge */}
                        {completeness && (
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getCompletenessColor(completeness.level)}`}>
                            {completeness.score}점 ({getCompletenessLevelKo(completeness.level)})
                          </span>
                        )}
                        {/* Brief #3: Engagement Badge (Indicative) */}
                        {engagement && (
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getEngagementColor(engagement.level)}`} title="음성 패턴 기반 추정치">
                            참여 {engagement.levelKo}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {record.tbmWorkType || "작업 전 안전회의"}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1">
                      {onDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete({ type: "single", id: record.id });
                          }}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                          title="삭제"
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                        title={isExpanded ? "접기" : "펼치기"}
                      >
                        <span className="material-symbols-outlined text-xl">
                          {isExpanded ? "expand_less" : "expand_more"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {record.tbmExtractedInspector && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        👤 {record.tbmExtractedInspector}
                      </span>
                    )}
                    {participants.length > 0 && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        👥 {participants.length}명 참석
                      </span>
                    )}
                    {hazards.length > 0 && (
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                        ⚠️ {hazards.length}개 위험요인
                      </span>
                    )}
                  </div>

                  {/* Hazard Badges */}
                  {hazards.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {hazards.map((hazard, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-1 text-xs rounded-md ${getHazardColor(hazard)}`}
                        >
                          {hazard}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-4 bg-gray-50">
                    {/* Summary */}
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 요약</h4>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded-md border border-gray-200">
                        {record.tbmSummary || "요약 없음"}
                      </div>
                    </div>

                    {/* Transcript */}
                    {record.tbmTranscript && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">🎙️ 전사본</h4>
                        <div className="text-sm text-gray-600 whitespace-pre-wrap bg-white p-3 rounded-md border border-gray-200 max-h-40 overflow-y-auto">
                          {record.tbmTranscript}
                        </div>
                      </div>
                    )}

                    {/* Participants */}
                    {participants.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">👥 참석자</h4>
                        <div className="flex flex-wrap gap-2">
                          {participants.map((name, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-md"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completeness Analysis */}
                    {completeness && (completeness.missingTopics?.length || completeness.suggestions?.length) && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1">
                          <span>📊</span> TBM 완성도 분석
                          <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getCompletenessColor(completeness.level)}`}>
                            {completeness.score}점
                          </span>
                        </h4>

                        {completeness.missingTopics && completeness.missingTopics.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-amber-700 mb-1">누락된 항목:</p>
                            <div className="flex flex-wrap gap-1">
                              {completeness.missingTopics.map((topic, idx) => (
                                <span key={idx} className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {completeness.suggestions && completeness.suggestions.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-amber-700 mb-1">개선 제안:</p>
                            <ul className="text-xs text-amber-700 space-y-1">
                              {completeness.suggestions.map((suggestion, idx) => (
                                <li key={idx} className="flex items-start gap-1">
                                  <span className="text-amber-500">•</span>
                                  <span>{suggestion}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Brief #3: Engagement Quality Analysis (Indicative) */}
                    {engagement && (
                      <div className={`mb-4 p-3 border rounded-lg ${getEngagementBgColor(engagement.level)}`}>
                        <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                          <span>💬</span> 참여도 추정
                          <span className={`ml-2 px-2 py-0.5 text-xs rounded-full border ${getEngagementColor(engagement.level)}`}>
                            {engagement.score}점 ({engagement.levelKo})
                          </span>
                        </h4>

                        {/* Disclaimer */}
                        <p className="text-[10px] text-gray-500 mb-2 italic">
                          ※ 음성 패턴 기반 추정치이며, 실제와 다를 수 있습니다
                        </p>

                        {/* Factor breakdown */}
                        <div className="mb-3 space-y-1.5">
                          {engagement.factors.map((factor, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="text-gray-700 flex items-center gap-1">
                                <span className={factor.detected ? "text-green-500" : "text-gray-400"}>
                                  {factor.detected ? "✓" : "○"}
                                </span>
                                {factor.nameKo}
                              </span>
                              <span className={factor.detected ? "text-green-600 font-medium" : "text-gray-400"}>
                                {factor.detected && factor.evidence ? factor.evidence : ""}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Suggestions */}
                        {engagement.suggestions && engagement.suggestions.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-700 mb-1">참고 제안:</p>
                            <ul className="text-xs text-gray-600 space-y-1">
                              {engagement.suggestions.map((suggestion, idx) => (
                                <li key={idx} className="flex items-start gap-1">
                                  <span className="text-blue-500">💡</span>
                                  <span>{suggestion}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Button */}
                    <button
                      onClick={() => onSelectTBM(record)}
                      className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition font-medium"
                    >
                      이 TBM 기준으로 문서 검증하기
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    {renderConfirmDialog()}
    </>
  );
}
