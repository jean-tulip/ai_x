"use client";

import { useState } from "react";

interface EmptyDocumentStateProps {
  onFileSelect: (file: File) => void;
  onStartTBM?: () => void;
  onUploadClick: (e?: React.MouseEvent) => void;
}

export function EmptyDocumentState({
  onUploadClick,
  onFileSelect,
  onStartTBM,
}: EmptyDocumentStateProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(
      (f) => f.type === "application/pdf" || f.type.startsWith("image/")
    );

    if (validFile) onFileSelect(validFile);
  };

  return (
    <div
      className="flex items-center justify-center w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={[
          "relative z-10",
          "flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed transition-all duration-300 w-full",
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-slate-950 scale-[1.02]"
            : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950",
        ].join(" ")}
      >
        {/* Icon - smaller */}
        <div className={`relative ${isDragging ? "animate-bounce" : ""}`}>
          <div className="size-16 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
            <span className="material-symbols-outlined text-4xl text-white">
              upload_file
            </span>
          </div>
          {isDragging && (
            <div className="absolute inset-0 rounded-xl bg-blue-500/20 animate-ping" />
          )}
        </div>

        {/* Text - more compact */}
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">
            {isDragging ? "파일을 여기에 놓으세요" : "새 문서 업로드"}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isDragging ? "파일을 드롭하여 검증 시작" : "PDF 또는 이미지 파일을 드래그하거나 업로드"}
          </p>
        </div>

        {/* Actions - more compact */}
        <div className="flex flex-wrap items-center justify-center gap-3 w-full">
          <button
            type="button"
            onClick={(e) => onUploadClick(e)}
            className="relative z-20 px-5 py-2.5 rounded-xl bg-primary text-white font-bold inline-flex items-center gap-2 hover:bg-green-600 active:scale-[0.98] transition shadow-md"
            style={{ touchAction: "manipulation" }}
            title="문서 업로드"
          >
            <span className="material-symbols-outlined pointer-events-none text-xl">upload</span>
            파일 업로드
          </button>

          {onStartTBM && (
            <button
              type="button"
              onClick={() => onStartTBM()}
              className="relative z-20 px-5 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] transition"
              style={{ touchAction: "manipulation" }}
              title="TBM 시작"
            >
              <span className="material-symbols-outlined text-xl">mic</span>
              TBM 녹음
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
