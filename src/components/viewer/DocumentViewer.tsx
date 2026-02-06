"use client";

import { useState, useEffect } from "react";
import { DocumentTypeBadge } from "@/components/DocumentTypeBadge";
import { EmptyDocumentState } from "@/components/EmptyDocumentState";
import { RecentDocuments } from "@/components/RecentDocuments";
import type { ImageQuality } from "@/components/ImageQualityCard";

interface DocumentViewerProps {
  file: File | null;
  pageImages: string[];
  reportIssues: any[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onPickFile: (e?: React.MouseEvent) => void; // 파일 선택창 여는 트리거
  onFileSelect: (file: File) => void; // drag & drop 에서 파일 들어오는 경로
  onStartTBM?: () => void;
  onClearFile?: () => void;
  historicalFileName?: string;
  documentType?: string | null;
  currentProjectId?: string | null;
  currentReportId?: string;
  onLoadDocument?: (id: string) => void;
  tbmSummary?: string;
  tbmTranscript?: string;
  imageQuality?: ImageQuality | null;
}

export default function DocumentViewer({
  file,
  pageImages,
  reportIssues,
  currentPage,
  onPageChange,
  onPickFile,
  onFileSelect,
  onStartTBM,
  onClearFile,
  historicalFileName,
  documentType,
  currentProjectId,
  currentReportId,
  onLoadDocument,
  tbmSummary,
  tbmTranscript,
  imageQuality,
}: DocumentViewerProps) {
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const fileDisplayName = file?.name ?? historicalFileName ?? "파일을 업로드하세요";

  // Reset loading state when page or images change
  useEffect(() => {
    setImageLoading(true);
  }, [currentPage, pageImages]);

  const totalPages = pageImages.length;
  const hasNext = currentPage < totalPages - 1;
  const hasPrev = currentPage > 0;

  const handleNext = () => hasNext && onPageChange(currentPage + 1);
  const handlePrev = () => hasPrev && onPageChange(currentPage - 1);

  return (
    <div className="flex-1 flex flex-col min-h-0 border-r border-slate-200 dark:border-slate-700 relative z-0 bg-slate-200/50 h-full">
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-slate-700 shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-slate-400">description</span>

          <span className="text-lg font-bold text-slate-800 dark:text-white truncate max-w-[200px] xl:max-w-[400px]">
            {fileDisplayName}
          </span>

          {documentType && <DocumentTypeBadge type={documentType} size="sm" />}

          {/* Image Quality Badge - Minimal */}
          {imageQuality && file && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-semibold shrink-0 border border-green-200 dark:border-green-800">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              품질 확인
            </span>
          )}

          {historicalFileName && !file && (
            <span className="px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0">
              과거 기록
            </span>
          )}

          {file && (
            <button
              onClick={onPickFile}
              className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors flex-shrink-0"
              title="새 문서 업로드"
              aria-label="새 문서 업로드"
            >
              <span className="material-symbols-outlined text-xl">upload_file</span>
            </button>
          )}

          {onClearFile && (
            <button
              onClick={onClearFile}
              disabled={!file}
              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
              title={file ? "현재 파일 삭제" : "삭제할 파일 없음"}
              aria-label={file ? "현재 파일 삭제" : "삭제할 파일 없음"}
            >
              <span className="material-symbols-outlined text-xl">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact mode - Show when document is loaded */}
      {onLoadDocument && (file || historicalFileName) && (
        <RecentDocuments
          currentProjectId={currentProjectId ?? null}
          currentReportId={currentReportId}
          onSelectDocument={onLoadDocument}
          maxItems={4}
          mode="compact"
        />
      )}

      <div className="flex-1 overflow-auto p-6 flex justify-center items-start bg-slate-300/30">
        {!file && !historicalFileName && (
          <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
            {/* Show recent documents FIRST if available - returning users see their work immediately */}
            {onLoadDocument && currentProjectId && (
              <div className="w-full">
                <RecentDocuments
                  currentProjectId={currentProjectId}
                  currentReportId={currentReportId}
                  onSelectDocument={onLoadDocument}
                  maxItems={4}
                  mode="full"
                />
              </div>
            )}

            {/* Upload area - shown below recent docs or as primary if no recent docs */}
            <EmptyDocumentState
              onFileSelect={onFileSelect}
              onUploadClick={(e) => onPickFile(e)}
              onStartTBM={onStartTBM}
            />
          </div>
        )}

        {/* ✅ TBM-only mode: show TBM card */}
        {!file && documentType === "TBM" && historicalFileName && (
          <div className="w-full max-w-[800px] bg-white dark:bg-surface-dark rounded-3xl shadow-2xl p-8 border border-slate-200 dark:border-slate-700 mt-20">
            <div className="flex items-center gap-3 mb-6">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
                <span className="material-symbols-outlined text-4xl text-white">
                  mic
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">TBM 완료</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">작업 전 대화 기록</p>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
              <p className="text-sm text-green-900 dark:text-green-200">
                <span className="material-symbols-outlined text-sm align-middle mr-1">
                  check_circle
                </span>
                TBM 요약이 생성되었습니다. 오른쪽 패널에서 결과를 확인하고 PDF로 내보낼 수 있습니다.
              </p>
            </div>

            {tbmSummary && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 mb-6 max-h-[400px] overflow-y-auto">
                <h4 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-xl">summarize</span>
                  요약 미리보기
                </h4>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {tbmSummary.substring(0, 300)}
                  {tbmSummary.length > 300 && "..."}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={(e) => onPickFile(e)}
                className="px-6 py-3 rounded-2xl bg-primary text-white font-black shadow-lg shadow-green-200 inline-flex items-center gap-2 hover:bg-green-600 transition-colors"
                title="추가로 안전 서류를 업로드하여 검증할 수 있습니다"
              >
                <span className="material-symbols-outlined">add_a_photo</span>
                안전 서류 업로드
              </button>

              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                <span className="material-symbols-outlined text-sm">info</span>
                TBM 단독으로도 PDF 내보내기 가능
              </div>
            </div>
          </div>
        )}

        {/* ✅ Historical record (non-TBM) */}
        {!file && documentType !== "TBM" && historicalFileName && (
          <div className="w-full max-w-[800px] bg-white dark:bg-surface-dark rounded-3xl shadow-2xl p-8 border border-slate-200 dark:border-slate-700 mt-20">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-4xl text-blue-500">
                history
              </span>
              <h3 className="text-2xl font-black">과거 검증 기록</h3>
            </div>

            <p className="text-slate-600 dark:text-slate-300 mb-4">
              이 검증은{" "}
              <span className="font-bold text-slate-900 dark:text-white">
                {historicalFileName}
              </span>{" "}
              파일에 대한 과거 기록입니다.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                <span className="material-symbols-outlined text-sm align-middle mr-1">
                  info
                </span>
                원본 문서 이미지는 보존되지 않습니다. 오른쪽 패널에서 검증 결과를 확인하실 수 있습니다.
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
  onClick={(e) => onPickFile(e)}
                className="px-6 py-3 rounded-2xl bg-primary text-white font-black shadow-lg shadow-green-200 inline-flex items-center gap-2 hover:bg-green-600 transition-colors"
                title="문서 종류를 선택하고 파일을 업로드합니다"
              >
                <span className="material-symbols-outlined">add_a_photo</span>
                새 파일 업로드
              </button>

              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                <span className="material-symbols-outlined text-sm">category</span>
                문서 종류 선택 가능
              </div>
            </div>
          </div>
        )}

        {totalPages > 0 && (
          <div className="relative w-full max-w-[860px] mb-8">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden pdf-page-shadow relative group">
              <div
                key={currentPage}
                className="absolute top-0 left-0 bg-slate-800/80 text-white text-xs px-2 py-1 rounded-br-lg z-10 font-mono"
              >
                PAGE {currentPage + 1} / {totalPages}
              </div>

              {totalPages > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrev();
                    }}
                    disabled={!hasPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-0 transition-all"
                    aria-label="이전 페이지"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNext();
                    }}
                    disabled={!hasNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 disabled:opacity-0 transition-all"
                    aria-label="다음 페이지"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </>
              )}

              {/* Loading skeleton */}
              {imageLoading && (
                <div className="w-full min-h-[600px] bg-slate-100 dark:bg-slate-800 animate-pulse flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <span className="material-symbols-outlined text-slate-400 text-5xl animate-spin">
                      sync
                    </span>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                      이미지 로딩 중...
                    </p>
                  </div>
                </div>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pageImages[currentPage]}
                alt={`Page ${currentPage + 1}`}
                className={`w-full h-auto block select-none cursor-zoom-in transition-opacity duration-300 ${
                  imageLoading ? "opacity-0 absolute" : "opacity-100"
                }`}
                onClick={() => setIsZoomOpen(true)}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
                title="클릭하여 확대 보기"
              />
            </div>
          </div>
        )}
      </div>

      {totalPages > 0 && isZoomOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-700"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <span className="material-symbols-outlined text-base">zoom_in</span>
                확대 보기
              </div>
              <button
                onClick={() => setIsZoomOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300"
                aria-label="확대 보기 닫기"
                title="닫기"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-auto max-h-[calc(85vh-56px)] bg-slate-100 dark:bg-slate-950 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pageImages[currentPage]}
                alt={`Zoomed page ${currentPage + 1}`}
                className="w-full h-auto block"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
