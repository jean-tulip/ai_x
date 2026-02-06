"use client";

import { useState, useEffect } from "react";

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
}

interface TBMTimelineProps {
  tbmRecords: TBMRecord[];
  loading: boolean;
  onSelectTBM: (record: TBMRecord) => void;
  onRefresh: () => void;
  onDelete?: (id: string) => void;
}

export default function TBMTimeline({ tbmRecords, loading, onSelectTBM, onRefresh, onDelete }: TBMTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    console.log("[TBMTimeline] Received records:", tbmRecords.length, tbmRecords);
  }, [tbmRecords]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">TBM 기록을 불러오는 중...</div>
      </div>
    );
  }

  if (tbmRecords.length === 0) {
    return (
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
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">TBM 타임라인</h2>
          <button
            onClick={onRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition"
            title="목록 새로고침"
          >
            <span className="material-symbols-outlined text-xl">refresh</span>
          </button>
        </div>

        <div className="space-y-4">
          {tbmRecords.map((record) => {
            const hazards = parseJsonField(record.tbmExtractedHazards);
            const participants = parseJsonField(record.tbmParticipants);
            const isExpanded = expandedId === record.id;

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
                      </div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {record.tbmWorkType || "작업 전 안전회의"}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {onDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("이 TBM 기록을 삭제하시겠습니까?")) {
                              // Clear expanded state before deleting to prevent DOM errors
                              if (expandedId === record.id) {
                                setExpandedId(null);
                              }
                              onDelete(record.id);
                            }
                          }}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                          title="삭제"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        className="text-gray-500 hover:text-gray-700 transition"
                      >
                        {isExpanded ? "▲" : "▼"}
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
  );
}
