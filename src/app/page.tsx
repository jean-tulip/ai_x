"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import DocumentViewer from "@/components/viewer/DocumentViewer";
import AnalysisPanel from "@/components/analysis/AnalysisPanel";
import ResizableSplitLayout from "@/components/layout/ResizableSplitLayout";
import { ThreeColumnLayout } from "@/components/layout/ThreeColumnLayout";
import { IssuesList } from "@/components/IssuesList";
import { ChatPanel } from "@/components/ChatPanel";
import HistorySidebar from "@/components/HistorySidebar";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { DocumentTypeSelector } from "@/components/DocumentTypeSelector";
import TBMRecorderModal from "@/components/TBMRecorderModal";
import { EditProjectModal } from "@/components/EditProjectModal";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { ProgressBar } from "@/components/ProgressBar";
import { TempMasterDocModal } from "@/components/TempMasterDocModal";
import { ImageQualityCard, type ImageQuality } from "@/components/ImageQualityCard";
import { ErrorDialog } from "@/components/ErrorDialog";
import { ErrorMessages, type ErrorDetails, formatErrorMessage } from "@/lib/errorMessages";
import { optimizeImage } from "@/lib/imageOptimizer";
import { get, set, del } from "idb-keyval";
import { calculateRiskLevel, riskCalculationToIssues } from "@/lib/riskMatrix";
import { analyzeCrossDocumentIssues, crossDocumentIssuesToValidationIssues } from "@/lib/crossDocumentAnalysis";
import { parseDocExtraction } from "@/lib/docSchema";
import { TEMPLATE_METADATA, TEMPLATES } from "@/lib/masterPlanTemplates";
import { useToast } from "@/contexts/ToastContext";
import { DocumentType } from "@/lib/documentTypes";
import { ModalDialog } from "@/components/ModalDialog";
import { exportReportToPDF } from "@/lib/pdfExport";
import TBMResultModal from "@/components/TBMResultModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import TBMTimeline from "@/components/TBMTimeline";

type Report = {
  fileName: string;
  issues: any[];
  chat: { role: "ai" | "user"; text: string }[];
  documentType?: string | null;

  // TBM-specific fields (matches database schema)
  tbmSummary?: string;        // AI-generated structured TBM summary
  tbmTranscript?: string;     // Full audio transcription
  tbmDuration?: number;       // Recording duration in milliseconds
  tbmWorkType?: string | null;           // 작업 종류
  tbmExtractedHazards?: string | null;   // JSON array of hazards
  tbmExtractedInspector?: string | null; // 담당자 이름
  tbmParticipants?: string | null;       // JSON array of participants

  // [Brief #2] Fall hazard detection status
  fallHazardStatus?: {
    detected: boolean;
    confidence: "high" | "medium" | "low";
    indicators: string[];
    source: string;
  } | null;
};

interface ModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line
  onCreate: (data: { name: string; description: string; file: File | null; templateId?: string }) => Promise<void>;
}

function NewProjectModal({ isOpen, onClose, onCreate }: ModalDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("general_construction");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onCreate({ name, description, file, templateId: selectedTemplateId });
      onClose();
      setName("");
      setDescription("");
      setFile(null);
      setSelectedTemplateId("general_construction");
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 w-full max-w-4xl border border-slate-200 dark:border-slate-700"
      initialFocusRef={nameInputRef}
    >
      <div className="mb-6">
        <h3 id={titleId} className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          새 프로젝트 생성
        </h3>
        <p id={descriptionId} className="text-slate-600 dark:text-slate-300">
          안전 검증을 위한 새로운 프로젝트를 설정합니다. 현장 특성에 맞는 안전 기준을 선택하세요.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Left Column: Project Details */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                프로젝트 정보
              </label>
              <div className="space-y-4">
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 font-medium text-lg"
                  placeholder="프로젝트 이름 입력"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  placeholder="프로젝트 설명 (선택사항)"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                마스터 안전 계획서 (PDF) <span className="text-slate-400 font-normal">- 선택사항</span>
              </label>
              <div className={`p-4 rounded-xl border border-dashed transition-colors ${file
                ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500"
                : "bg-slate-50 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 hover:border-blue-500"
                }`}>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center text-center">
                    {file ? (
                      <>
                        <span className="material-symbols-outlined text-3xl text-blue-500 mb-2">assignment_turned_in</span>
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{file.name}</span>
                        <span className="text-xs text-blue-500 mt-1">클릭하여 변경</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFile(null);
                          }}
                          className="absolute top-1 right-1 p-1.5 text-blue-400 hover:text-red-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full transition-colors z-10"
                          title="파일 제거"
                        >
                          <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-3xl text-slate-400 mb-2">upload_file</span>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">PDF 파일 업로드</span>
                        <span className="text-xs text-slate-400 mt-1">여기를 클릭하거나 파일을 드래그하세요</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Site Type Selection */}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
              현장 유형 및 안전 기준
            </label>

            {/* Template Grid */}
            <div className={`grid grid-cols-2 gap-3 transition-opacity ${file ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              {TEMPLATE_METADATA.map((t) => {
                const isSelected = selectedTemplateId === t.id && !file;
                let icon = "construction";
                if (t.id === "high_rise") icon = "location_city";
                if (t.id === "infrastructure") icon = "engineering";
                if (t.id === "interior_renovation") icon = "design_services";

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(t.id);
                      setFile(null); // Deselect file if clicking a template
                    }}
                    className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all text-center group h-32 ${isSelected
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500 shadow-sm"
                      : "border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800"
                      }`}
                  >
                    <div className={`p-2 rounded-lg mb-2 transition-colors ${isSelected
                      ? "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200"
                      : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-600"
                      }`}>
                      <span className="material-symbols-outlined text-3xl">{icon}</span>
                    </div>

                    <div className="font-bold text-slate-900 dark:text-white leading-tight text-sm">
                      {t.name.split('(')[0].trim()}
                    </div>

                    {isSelected && (
                      <div className="absolute top-2 right-2 text-blue-500">
                        <span className="material-symbols-outlined text-lg">check_circle</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Template Description Box */}
            {!file && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold block mb-1 text-slate-900 dark:text-white">
                  {TEMPLATE_METADATA.find(t => t.id === selectedTemplateId)?.name}
                </span>
                {TEMPLATE_METADATA.find(t => t.id === selectedTemplateId)?.description}
              </div>
            )}

            {/* PDF Upload Override Message */}
            {file && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                <span className="material-symbols-outlined text-lg shrink-0">upload_file</span>
                <div>
                  <span className="font-bold block mb-0.5">PDF 마스터 플랜 사용 중</span>
                  업로드된 &quot;{file.name}&quot; 문서를 기준으로 안전 검증을 수행합니다. 템플릿 선택은 무시됩니다.
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                    }}
                    className="block mt-1.5 text-blue-600 underline hover:text-blue-800 font-bold"
                  >
                    업로드 취소하고 템플릿 사용하기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                생성 중...
              </span>
            ) : "프로젝트 생성"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

export default function Page() {
  const router = useRouter();
  const [checkingFirstVisit, setCheckingFirstVisit] = useState(true);

  // Check for first-time visitor and redirect to intro
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem("hasSeenIntro");
    if (!hasSeenIntro) {
      router.replace("/poster");
    } else {
      setCheckingFirstVisit(false);
    }
  }, [router]);

  const toast = useToast();
  const [latestTBM, setLatestTBM] = useState<{
    summary: string;
    transcript: string;
    workType?: string | null;
    extractedHazards?: any[];
    extractedInspector?: string | null;
  } | null>(null);

  // Photo findings for three-way synthesis (TBM + Document + Photo)
  const [latestPhotoFindings, setLatestPhotoFindings] = useState<{
    fileName: string;
    violations: Array<{
      id: string;
      violation: string;
      severity: string;
      evidence: string;
      location: string;
    }>;
    checklist: Array<{
      id: string;
      nameKo: string;
      value: string;
      category: string;
    }>;
    overallRisk: string | null;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isPickingRef = useRef(false);
  const [tbmMode, setTbmMode] = useState<"record" | "upload">("record");

  const validationAbortController = useRef<AbortController | null>(null);

  const [tbmOpen, setTbmOpen] = useState(false);
  const [tbmResultOpen, setTbmResultOpen] = useState(false);
  const [tbmResult, setTbmResult] = useState<any>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [historicalFileName, setHistoricalFileName] = useState<string | undefined>(undefined);
  const [currentReportId, setCurrentReportId] = useState<string | undefined>(undefined);

  const [showDocTypeSelector, setShowDocTypeSelector] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const [tempMasterDoc, setTempMasterDoc] = useState<{ text: string; fileName: string } | null>(null);
  const [showTempMasterModal, setShowTempMasterModal] = useState(false);

  const [validationStep, setValidationStep] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [imageQuality, setImageQuality] = useState<ImageQuality | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ error: ErrorDetails; onRetry?: () => void } | null>(null);
  const [activeValidationType, setActiveValidationType] = useState<"document" | "photo" | "auto">("document");
  const [hiddenIssueIds, setHiddenIssueIds] = useState<string[]>([]); // Persist dismissed issues
  const [hasUnviewedIssues, setHasUnviewedIssues] = useState(false); // Show indicator when analysis completes
    const [localChatMessages, setLocalChatMessages] = useState<{ role: "ai" | "user"; text: string }[]>([]); // Persist local chat
  const [chatExternalMessage, setChatExternalMessage] = useState<string | null>(null); // For corrective action injection
  const [forceAnalysisPanel, setForceAnalysisPanel] = useState<"analysis" | "issues" | null>(null); // Force switch to analysis tab

  // Document validation stages (5 stages)
  const documentValidationSteps = [
    { id: "stage1", label: "형식 검증", icon: "description" },
    { id: "stage2", label: "논리 검증", icon: "rule" },
    { id: "stage3", label: "교차 분석", icon: "compare_arrows" },
    { id: "stage4", label: "패턴 감지", icon: "analytics" },
    { id: "stage5", label: "위험 평가", icon: "shield" },
  ];

  // Photo validation stages (3 stages - faster and more relevant)
  const photoValidationSteps = [
    { id: "stage1", label: "이미지 분석", icon: "photo_camera" },
    { id: "stage2", label: "안전 검증", icon: "verified_user" },
    { id: "stage3", label: "결과 생성", icon: "check_circle" },
  ];

  // Auto-detect validation stages (for images with auto-detect - neutral steps)
  const autoDetectValidationSteps = [
    { id: "stage1", label: "파일 분류", icon: "category" },
    { id: "stage2", label: "내용 분석", icon: "search" },
    { id: "stage3", label: "결과 생성", icon: "check_circle" },
  ];

  // Use appropriate stages based on validation type
  const validationSteps = activeValidationType === "photo"
    ? photoValidationSteps
    : activeValidationType === "auto"
    ? autoDetectValidationSteps
    : documentValidationSteps;

  const [projects, setProjects] = useState<any[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0); // Increments when history changes to sync RecentDocuments
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; description: string } | null>(null);
  const [projectSelectorKey, setProjectSelectorKey] = useState(0);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  const [showWelcome, setShowWelcome] = useState(true);

  // TBM Timeline states
  const [activeTab, setActiveTab] = useState<"document" | "tbm">("document");
  const [tbmRecords, setTbmRecords] = useState<any[]>([]);
  const [loadingTBMs, setLoadingTBMs] = useState(true); // Start true to show loading on first visit
  const [tbmInitialLoadDone, setTbmInitialLoadDone] = useState(false);

  // Confirmation dialog states
  const [confirmClearFile, setConfirmClearFile] = useState(false);
  const [confirmProjectSwitch, setConfirmProjectSwitch] = useState<{ projectId: string | null } | null>(null);

  useEffect(() => setCurrentPage(0), [file, pageImages]);

  useEffect(() => {
    return () => {
      if (validationAbortController.current) {
        validationAbortController.current.abort();
        validationAbortController.current = null; // ✅ Prevent memory leak
      }
    };
  }, []);

  useEffect(() => {
    const savedProjectId = localStorage.getItem("current_project_id");
    if (savedProjectId) setCurrentProjectId(savedProjectId);

    async function loadTempMasterDoc() {
      try {
        const saved = await get("temp_master_doc");
        if (saved) setTempMasterDoc(saved);
      } catch (e) {
        console.error("Failed to load temp master doc", e);
      }
    }
    loadTempMasterDoc();

    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSelectorKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentProjectId) {
      localStorage.setItem("current_project_id", currentProjectId);
      if (tempMasterDoc) {
        setTempMasterDoc(null);
        del("temp_master_doc");
      }
    } else {
      localStorage.removeItem("current_project_id");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap";
    link.rel = "stylesheet";
    link.as = "style";
    document.head.appendChild(link);
  }, []);

  // Load TBM records when switching to TBM tab or project changes
  useEffect(() => {
    if (activeTab === "tbm") {
      loadTBMRecords();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentProjectId]);

  async function fetchProjects(retryCount = 0) {
    setIsLoadingProjects(true);
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 10000; // 10 second timeout
    let shouldRetry = false;

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch("/api/projects", { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        setProjects(await res.json());
      } else {
        console.error("Failed to fetch projects: HTTP", res.status);
      }
    } catch (e: any) {
      // Check if it was a timeout/abort
      if (e.name === "AbortError") {
        console.warn(`fetchProjects timeout (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        // Retry on timeout (dev server might be warming up)
        if (retryCount < MAX_RETRIES) {
          shouldRetry = true;
        }
      } else {
        console.error("Failed to fetch projects", e);
      }
    } finally {
      if (shouldRetry) {
        // Schedule retry - keep loading state true
        setTimeout(() => fetchProjects(retryCount + 1), 1000);
      } else {
        setIsLoadingProjects(false);
      }
    }
  }

  function pickFileDialog(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();

    if (isPickingRef.current) return;
    isPickingRef.current = true;

    fileInputRef.current?.click();

    setTimeout(() => {
      isPickingRef.current = false;
    }, 5000);
  }

  const pdfjsPromiseRef = useRef<Promise<any> | null>(null);
  async function getPdfjs() {
    if (!pdfjsPromiseRef.current) {
      pdfjsPromiseRef.current = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
        (pdfjs as any).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        return pdfjs;
      });
    }
    return pdfjsPromiseRef.current;
  }

  useEffect(() => {
    if (!file) {
      setPageImages([]);
      return;
    }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPageImages([url]);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  function toggleDark() {
    document.documentElement.classList.toggle("dark");
  }

  function dismissWelcome() {
    setShowWelcome(false);
  }

  function showWelcomeScreen() {
    setShowWelcome(true);
    // Don't auto-clear file when navigating to home
    // Users can explicitly clear if needed
  }

  function showError(error: ErrorDetails, onRetry?: () => void) {
    setErrorDialog({ error, onRetry });
  }

  async function hasMicInput() {
    const ds = await navigator.mediaDevices.enumerateDevices();
    return ds.some((d) => d.kind === "audioinput");
  }

  function startTBM(initialMode: "record" | "upload" = "record") {
    console.log("[TBM] startTBM clicked", initialMode);
    dismissWelcome();
    setTbmMode(initialMode);
    setTbmOpen(true);
  }

  async function renderPdfPages(pdfFile: File, signal: AbortSignal) {
    const pdfjs = await getPdfjs();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const buf = await pdfFile.arrayBuffer();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // ✅ Create single canvas for all pages (canvas pooling)
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    const images: string[] = [];
    const skippedPages: number[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      try {
        // ✅ Wrap in try-catch to handle corrupt pages
        const page = await pdf.getPage(i);
        // Reduced scale from 1.5 to 1.0 for lower initial size
        const viewport = page.getViewport({ scale: 1.0 });

        // ✅ Resize canvas for current page (reuse same canvas)
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        // ✅ Export with JPEG compression (0.85 quality for good balance)
        // Note: Scale is already 1.0 and viewport auto-sizes to reasonable dimensions,
        // so no additional optimization needed (prevents double compression)
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        images.push(dataUrl);
      } catch (pageError) {
        // ✅ Skip corrupt pages instead of crashing
        console.warn(`Skipping corrupt PDF page ${i}:`, pageError);
        skippedPages.push(i);
      }
    }

    // ✅ Log summary of skipped pages
    if (skippedPages.length > 0) {
      console.warn(`Skipped ${skippedPages.length} corrupt page(s): ${skippedPages.join(", ")}`);
    }

    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    setPageImages(images);
    return images;
  }

  async function extractPdfText(pdfFile: File, signal: AbortSignal) {
    const pdfjs = await getPdfjs();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const buf = await pdfFile.arrayBuffer();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    let full = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it: any) => (typeof it.str === "string" ? it.str : ""))
        .join(" ");
      full += `\n[PAGE ${p}]\n${pageText}\n`;
    }
    return full;
  }

  async function runValidation(f: File, documentType: DocumentType | null = null) {
    if (validationAbortController.current) validationAbortController.current.abort();

    const controller = new AbortController();
    validationAbortController.current = controller;
    const signal = controller.signal;

    // Set validation type based on document type and file type
    const isPhotoValidation = documentType === "SITE_PHOTO";
    const isImageFile = f.type.startsWith("image/");
    const isAutoDetectImage = documentType === null && isImageFile;

    // Use "auto" progress for image auto-detection (shows neutral steps)
    // Use "photo" for explicit site photo selection
    // Use "document" for PDFs or explicit document type selection
    setActiveValidationType(
      isPhotoValidation ? "photo" : isAutoDetectImage ? "auto" : "document"
    );

    setLoading(true);
    setShowProgress(true);
    setValidationStep(0);

    const startTime = Date.now();
    const minDisplayTime = 800;
    let progressInterval: ReturnType<typeof setInterval> | null = null;

    try {
      let text = "";
      let images: string[] = [];

      if (f.type === "application/pdf") {
        images = await renderPdfPages(f, signal);
        text = await extractPdfText(f, signal);
      } else if (f.type.startsWith("image/")) {
        // ✅ Basic image validation
        if (f.size < 10000) {
          // Less than 10KB is suspiciously small
          if (!signal.aborted) {
            showError(ErrorMessages.IMAGE_TOO_SMALL(), () => pickFileDialog());
            setFile(null);
            setShowProgress(false);
          }
          return;
        }

        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(f);
        });
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        // ✅ Check image dimensions (off main thread using createImageBitmap when available)
        let imgWidth: number, imgHeight: number;

        // Try createImageBitmap for off-main-thread decoding (modern browsers)
        if (typeof createImageBitmap !== 'undefined') {
          try {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            if (signal.aborted) throw new DOMException("Aborted", "AbortError");

            const bitmap = await createImageBitmap(blob);
            imgWidth = bitmap.width;
            imgHeight = bitmap.height;
            bitmap.close(); // Clean up immediately
          } catch (e) {
            console.warn("[Image] createImageBitmap failed, falling back to Image:", e);
            // Fallback to Image element
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = dataUrl;
            });
            imgWidth = img.width;
            imgHeight = img.height;
          }
        } else {
          // Fallback for older browsers
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
          });
          imgWidth = img.width;
          imgHeight = img.height;
        }

        if (imgWidth < 400 || imgHeight < 400) {
          if (!signal.aborted) {
            showError(ErrorMessages.IMAGE_LOW_RESOLUTION(imgWidth, imgHeight), () => pickFileDialog());
            setFile(null);
            setShowProgress(false);
          }
          return;
        }

        console.log(`[Image] Validated: ${imgWidth}x${imgHeight}, ${(f.size / 1024).toFixed(1)}KB`);

        // ✅ Optimize image to reduce token usage
        try {
          const optimized = await optimizeImage(dataUrl, 2048, 0.85);
          images = [optimized.dataUrl];
          console.log(`[Image] Optimized: ${optimized.width}x${optimized.height}, saved ${((1 - optimized.compressionRatio) * 100).toFixed(1)}%`);
        } catch (e) {
          console.warn("Failed to optimize image, using original", e);
          images = [dataUrl];
        }
        // Update document viewer with the new image
        setPageImages(images);
      }

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const hasText = text && text.trim().length >= 50;
      const hasImages = images && images.length > 0;
      if (!hasText && !hasImages) {
        if (!signal.aborted) {
          showError(ErrorMessages.EMPTY_DOCUMENT(), () => pickFileDialog());
          setFile(null);
          setReport(null);
          setShowProgress(false);
        }
        return;
      }

      let imagesToSend: string[] = [];
      if (images.length > 0) {
        imagesToSend.push(images[0]);
        if (images.length > 1) imagesToSend.push(images[images.length - 1]);
      }

      // Different progress for photos/auto-detect vs documents
      if (isPhotoValidation || isAutoDetectImage) {
        // Photo/Auto validation: 3 stages
        // Stage 1: 이미지 분석 / 파일 분류
        await new Promise((r) => setTimeout(r, 150));
        setValidationStep(1);
        console.log(`[${isPhotoValidation ? "Photo" : "Auto"} Validation] Stage 1/3 - ${isAutoDetectImage ? "File classification" : "Image analysis"}`);

        // Stage 2: 안전 검증 / 내용 분석 - animate during API call
        await new Promise((r) => setTimeout(r, 150));
        console.log(`[${isPhotoValidation ? "Photo" : "Auto"} Validation] Stage 2/3 - ${isAutoDetectImage ? "Content analysis" : "Safety validation"} (animating...)`);
        let progressValue = 1.0;
        progressInterval = setInterval(() => {
          progressValue += 0.15;
          if (progressValue < 2.8) {
            setValidationStep(Math.min(progressValue, 2.5));
          }
        }, 300);
      } else {
        // Document validation: 5 stages
        // Stage 1: 형식 검증 (Format validation)
        await new Promise((r) => setTimeout(r, 200));
        setValidationStep(1);
        console.log("[Validation] Stage 1/5 - Format validation");

        // Stage 2: 논리 검증 (Logic validation)
        await new Promise((r) => setTimeout(r, 300));
        setValidationStep(2);
        console.log("[Validation] Stage 2/5 - Logic validation");

        // Stage 3: 교차 분석 (Cross-document analysis)
        await new Promise((r) => setTimeout(r, 400));
        setValidationStep(3);
        console.log("[Validation] Stage 3/5 - Cross-document analysis");

        // Stage 4: 패턴 감지 (Pattern detection) - animate during API call
        await new Promise((r) => setTimeout(r, 300));
        console.log("[Validation] Stage 4/5 - Pattern detection (animating...)");
        let progressValue = 3.0;
        progressInterval = setInterval(() => {
          progressValue += 0.15;
          if (progressValue < 4.8) {
            setValidationStep(Math.min(progressValue, 4.5));
          }
        }, 400);
      }

      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: f.name,
          pdfText: text,
          pageImages: imagesToSend,
          projectId: currentProjectId,
          documentType: documentType,
          tempContextText: !currentProjectId && tempMasterDoc ? tempMasterDoc.text : undefined,
          latestTBM: latestTBM ? {
            workType: latestTBM.workType,
            extractedHazards: latestTBM.extractedHazards || [],
            extractedInspector: latestTBM.extractedInspector,
            summary: latestTBM.summary,
          } : null,
        }),
        signal,
      });

      // Clear animation interval before processing response
      if (progressInterval) clearInterval(progressInterval);

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      const data = (await res.json()) as Report;
      if (latestTBM?.summary) {
        const first = data.chat?.[0]?.text || "";
        const merged = `${first}\n\n[TBM 요약]\n${latestTBM.summary}`.trim();

        data.chat = [
          { role: "ai", text: merged },
          ...(data.chat?.slice(1) ?? []),
        ];

        data.tbmSummary = latestTBM.summary;
        data.tbmTranscript = latestTBM.transcript || "";
      }
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      if (!res.ok) {
        if (res.status === 400) {
          if (!signal.aborted) {
            const errorMsg = (data as any).error || "문서 검증에 실패했습니다";
            // Check if it's a "not a safety document" error
            if (errorMsg.includes("안전") || errorMsg.includes("문서")) {
              showError(ErrorMessages.NOT_SAFETY_DOCUMENT(), () => pickFileDialog());
            } else {
              showError(ErrorMessages.VALIDATION_FAILED(errorMsg), () => {
                if (f) runValidation(f, documentType);
              });
            }
            setFile(null);
            setReport(null);
            setShowProgress(false);
          }
          return;
        }
        throw new Error((data as any).error || "서버 오류가 발생했습니다");
      }

      // Final stage: Complete (set to totalSteps to show 100% progress)
      if (isPhotoValidation || isAutoDetectImage) {
        // Photo/Auto Stage 3: 결과 생성 (Result generation complete)
        // Set to 3 so progress shows 3/3 = 100%
        setValidationStep(3);
        console.log(`[${isPhotoValidation ? "Photo" : "Auto"} Validation] Stage 3/3 complete - Result generation done`);
      } else {
        // Document Stage 5: 위험 평가 (Risk assessment complete)
        // Set to 5 so progress shows 5/5 = 100%
        setValidationStep(5);
        console.log("[Validation] Stage 5/5 complete - Risk assessment done");
      }

      const elapsedTime = Date.now() - startTime;
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);
      await new Promise((r) => setTimeout(r, remainingTime + 200));

      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      data.issues = (data.issues ?? []).map((i: any) => ({ ...i, id: i.id || crypto.randomUUID() }));

      // Store photo findings for three-way synthesis (TBM + Document + Photo)
      if (data.documentType === "SITE_PHOTO" || (data as any).extracted?.docType === "SITE_PHOTO") {
        setLatestPhotoFindings({
          fileName: f.name,
          violations: (data.issues || [])
            .filter((i: any) => i.ruleId?.startsWith("photo_"))
            .map((i: any) => ({
              id: i.ruleId,
              violation: i.title,
              severity: i.severity,
              evidence: i.message,
              location: "",
            })),
          checklist: (data as any).extracted?.checklist || [],
          overallRisk: (data as any).extracted?.riskLevel || null,
        });
      }

      const tbmSummaryValue = data.tbmSummary?.trim();
      const tbmTranscriptValue = data.tbmTranscript?.trim();
      // ✅ 일반 문서 리포트: TBM 선택이 없으면 TBM 필드는 비움
      setReport({
        ...data,
        documentType: documentType,
        tbmSummary: tbmSummaryValue ? data.tbmSummary : undefined,
        tbmTranscript: tbmTranscriptValue ? data.tbmTranscript : undefined,
      });

      // Clear local chat and hidden issues for new document
      setLocalChatMessages([]);
      setHiddenIssueIds([]);

      // Set indicator if there are issues to review
      if (data.issues && data.issues.length > 0) {
        console.log(`[Validation Complete] Setting hasUnviewedIssues=true, issues count: ${data.issues.length}`);
        setHasUnviewedIssues(true);
        // Auto-switch to issues tab on desktop
        setForceAnalysisPanel("issues");
      }

      // Brief pause to show 100% completion before hiding progress
      await new Promise((r) => setTimeout(r, 300));
    } catch (e: any) {
      if (progressInterval) clearInterval(progressInterval);
      if (e?.name === "AbortError") return;
      console.error(e);
      if (!signal.aborted) {
        showError(ErrorMessages.VALIDATION_ERROR(e?.message), () => {
          if (f) runValidation(f, documentType);
        });
        setFile(null);
        setReport(null);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setShowProgress(false);
      }
      // ✅ Clean up abort controller only if it's still ours (prevents race condition
      // where a newer validation's controller gets nulled by an older run's finally)
      if (validationAbortController.current === controller) {
        validationAbortController.current = null;
      }
    }
  }

  async function analyzeImageQuality(file: File): Promise<ImageQuality> {
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });

    const width = img.width;
    const height = img.height;
    const fileSize = file.size;
    const megapixels = (width * height) / 1_000_000;

    let quality: ImageQuality["quality"];
    const issues: string[] = [];
    const tips: string[] = [];

    // Determine quality level
    if (width >= 1920 && height >= 1080 && fileSize >= 100_000) {
      quality = "excellent";
      tips.push("이미지 품질이 우수합니다. 검증을 진행하세요.");
    } else if (width >= 1280 && height >= 720 && fileSize >= 50_000) {
      quality = "good";
      tips.push("이미지 품질이 양호합니다.");
    } else if (width >= 800 && height >= 600 && fileSize >= 30_000) {
      quality = "fair";
      issues.push("해상도가 다소 낮습니다. 더 선명한 사진을 권장합니다.");
      tips.push("밝은 조명에서 다시 촬영해보세요.");
      tips.push("카메라를 문서에 가까이 대고 촬영하세요.");
    } else {
      quality = "poor";
      issues.push("해상도가 매우 낮습니다 (" + width + "×" + height + ")");
      tips.push("최소 800×600 이상의 해상도로 촬영하세요.");
      tips.push("밝은 조명에서 문서 전체가 보이도록 촬영하세요.");
      tips.push("손떨림 방지를 위해 안정된 자세로 촬영하세요.");
    }

    // Check file size
    if (fileSize < 10_000) {
      quality = "poor";
      issues.push("파일 크기가 너무 작습니다 (" + (fileSize / 1024).toFixed(1) + "KB)");
      tips.push("원본 사진을 압축하지 말고 업로드하세요.");
    } else if (fileSize > 10_000_000) {
      issues.push("파일 크기가 매우 큽니다 (" + (fileSize / 1024 / 1024).toFixed(1) + "MB)");
      tips.push("업로드 시간이 오래 걸릴 수 있습니다.");
    }

    // Check aspect ratio (documents should be roughly rectangular)
    const aspectRatio = width / height;
    if (aspectRatio < 0.5 || aspectRatio > 2.5) {
      issues.push("비정상적인 가로세로 비율입니다. 문서 전체가 잘 보이는지 확인하세요.");
    }

    // Check megapixels
    if (megapixels < 0.5) {
      issues.push("이미지 해상도가 낮아 텍스트 인식이 어려울 수 있습니다.");
    }

    console.log(`[Image Quality] ${width}×${height}, ${(fileSize / 1024).toFixed(1)}KB, ${megapixels.toFixed(1)}MP → ${quality}`);

    return {
      resolution: { width, height },
      fileSize,
      quality,
      issues,
      tips,
    };
  }

  async function onPickFile(f: File) {
    dismissWelcome();

    if (f.size === 0) {
      showError(ErrorMessages.EMPTY_FILE(), () => pickFileDialog());
      return;
    }

    setFile(f);
    setReport(null);
    setHistoricalFileName(undefined);

    // Analyze image quality for images
    if (f.type.startsWith("image/")) {
      try {
        const quality = await analyzeImageQuality(f);
        setImageQuality(quality);

        // Warn about poor quality images
        if (quality.quality === "poor") {
          toast.warning("⚠️ 이미지 품질이 불량합니다. 검증 결과가 부정확할 수 있습니다.");
          // Still allow proceeding with validation, but show warning
        }
      } catch (error) {
        console.error("Image quality analysis failed:", error);
        // Continue anyway
      }
    } else {
      // Reset image quality for PDFs
      setImageQuality(null);
    }

    // Show document type selector for BOTH PDFs and images
    // User chooses whether it's a scanned document or site photo
    setPendingFile(f);
    setShowDocTypeSelector(true);
  }

  async function handleDocTypeSelect(type: DocumentType) {
    setSelectedDocType(type);
    setShowDocTypeSelector(false);
    if (pendingFile) {
      await runValidation(pendingFile, type);
      setPendingFile(null);
    }
  }

  async function handleDocTypeAutoDetect() {
    setShowDocTypeSelector(false);
    if (pendingFile) {
      await runValidation(pendingFile, null);
      setPendingFile(null);
    }
  }

  async function saveTBMHistory(r: any) {
    try {
      const resp = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TBM",
          projectId: currentProjectId,
          fileName: "TBM(작업 전 대화)",
          summary: r?.summary ?? "",
          transcript: r?.transcript ?? "",
          tbmDuration: r?.duration ?? 0,
          workType: r?.workType ?? null,
          extractedHazards: JSON.stringify(r?.extractedHazards ?? []),
          extractedInspector: r?.extractedInspector ?? null,
          participants: JSON.stringify(r?.participants ?? []),
          completenessScore: r?.completenessScore ?? null,
          // Brief #3: Engagement quality scoring
          engagementScore: r?.engagementScore ?? null,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        console.warn("[TBM] history save failed:", resp.status, t);
      } else {
        setProjectSelectorKey((k) => k + 1);
      }
    } catch (e) {
      console.warn("[TBM] history save error:", e);
    }
  }

  function isTBMHistoryRecord(data: any) {
    const dt = (data?.documentType ?? "") as string;
    const t = (data?.type ?? "") as string;
    return dt === "TBM" || t === "TBM";
  }

  async function loadTBMRecords() {
    setLoadingTBMs(true);
    try {
      // ✅ Filter TBMs server-side for better performance
      const params = new URLSearchParams({ documentType: "TBM" });
      if (currentProjectId) params.set("projectId", currentProjectId);

      const url = `/api/history?${params.toString()}`;

      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Failed to fetch: ${resp.status}`);
      }

      const tbms = await resp.json();

      console.log(`[TBM Timeline] Loaded ${tbms.length} TBM records`);
      setTbmRecords(tbms);
    } catch (e) {
      console.error("Failed to load TBM records:", e);
      setTbmRecords([]);
    } finally {
      setLoadingTBMs(false);
    }
  }

  async function deleteTBM(id: string) {
    try {
      // Optimistically remove from UI first to prevent DOM errors
      setTbmRecords(prev => prev.filter(r => r.id !== id));

      const resp = await fetch(`/api/history?id=${id}`, { method: "DELETE" });
      if (!resp.ok) {
        // Revert on failure - reload the list
        await loadTBMRecords();
        throw new Error("Failed to delete TBM");
      }

      toast.success("TBM 기록이 삭제되었습니다", 2000);
    } catch (e) {
      console.error("Failed to delete TBM:", e);
      toast.error("삭제에 실패했습니다", 2000);
    }
  }

  async function deleteAllTBMs() {
    const count = tbmRecords.length;
    if (count === 0) return;

    try {
      // Optimistically clear UI
      setTbmRecords([]);

      // Delete all TBM records
      const deletePromises = tbmRecords.map(record =>
        fetch(`/api/history?id=${record.id}`, { method: "DELETE" })
      );

      const results = await Promise.all(deletePromises);
      const failedCount = results.filter(r => !r.ok).length;

      if (failedCount > 0) {
        // Some failed - reload to get accurate state
        await loadTBMRecords();
        toast.error(`${failedCount}개 기록 삭제 실패`, 2000);
      } else {
        toast.success(`${count}개의 TBM 기록이 삭제되었습니다`, 2000);
      }
    } catch (e) {
      console.error("Failed to delete all TBMs:", e);
      await loadTBMRecords();
      toast.error("전체 삭제에 실패했습니다", 2000);
    }
  }

  async function loadReportFromHistory(id: string) {
    setLoading(true);
    setShowHistory(false);
    dismissWelcome();
    try {
      const res = await fetch(`/api/history?id=${id}`);
      if (!res.ok) throw new Error("Failed to load report");
      const data = await res.json();

      // ✅ TBM이면: 요약/전사 표시
      if (isTBMHistoryRecord(data)) {
        const tbmSummary = data.tbmSummary || data.summary || "";
        const tbmTranscript = data.tbmTranscript || data.transcript || "";

        setReport({
          fileName: data.fileName ?? "TBM(작업 전 대화)",
          issues: [],
          chat: [
            { role: "ai", text: tbmSummary || "(요약 결과가 비어있어요)" },
            ...(tbmTranscript
              ? [{ role: "ai" as const, text: `\n\n[전사본]\n${tbmTranscript}` }]
              : []),
          ],
          documentType: "TBM",
          tbmSummary,
          tbmTranscript,
        });

        setFile(null);
        setPageImages([]);
        setHistoricalFileName(data.fileName ?? "TBM(작업 전 대화)");
        setCurrentReportId(id);
        setLocalChatMessages([]); // Clear chat for new document
        setHiddenIssueIds([]); // Clear hidden issues for new document
        return;
      }


      let issues = JSON.parse(data.issuesJson);
      issues = issues.map((i: any) => ({ ...i, id: i.id || crypto.randomUUID() }));

      const issueCount = issues.length;
      const criticalIssues = issues.filter((i: any) => i.severity === "error").length;
      const chatText = `검증 기록 불러오기 완료\n\n파일명: ${data.fileName}\n발견된 문제: ${issueCount}개\n심각한 문제: ${criticalIssues}개\n\n참고: 과거 기록은 원본 이미지가 보존되지 않습니다.`;

      setReport({
        fileName: data.fileName,
        issues,
        chat: [{ role: "ai", text: chatText }],
        documentType: data.documentType ?? null,
        tbmSummary: undefined,
        tbmTranscript: undefined,
      });

      setFile(null);
      setPageImages([]);
      setHistoricalFileName(data.fileName);
      setCurrentReportId(id);
      setLocalChatMessages([]); // Clear chat for new document
      setHiddenIssueIds([]); // Clear hidden issues for new document
    } catch (e) {
      showError(ErrorMessages.LOAD_HISTORY_FAILED(), () => loadReportFromHistory(id));
    } finally {
      setLoading(false);
    }
  }

  async function exportReportFromHistory(id: string) {
    setLoading(true);
    dismissWelcome();

    let exportData: any = null;

    try {
      const res = await fetch(`/api/history?id=${id}`);
      if (!res.ok) throw new Error("Failed to load report");
      const data = await res.json();

      if (isTBMHistoryRecord(data)) {
        exportData = {
          fileName: data.fileName ?? "TBM(작업 전 대화)",
          projectName: projects.find((p) => p.id === currentProjectId)?.name,
          documentType: "TBM",
          createdAt: new Date(data.createdAt ?? Date.now()).toISOString(),
          issues: [],
          summary: { totalIssues: 0, criticalCount: 0, warningCount: 0, infoCount: 0 },
          projectId: currentProjectId,
          tbmSummary: data.tbmSummary || data.summary || "",
          tbmTranscript: data.tbmTranscript || data.transcript || "",
        };

        const response = await fetch("/api/export-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(exportData),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = "report.pdf";
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
          if (filenameMatch?.[1]) filename = decodeURIComponent(filenameMatch[1]);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success("TBM PDF를 다시 다운로드했습니다");
        return;
      }

      let issues = JSON.parse(data.issuesJson);
      issues = issues.map((i: any) => ({ ...i, id: i.id || crypto.randomUUID() }));

      exportData = {
        fileName: data.fileName,
        projectName: projects.find((p) => p.id === currentProjectId)?.name,
        documentType: data.documentType ?? null,
        createdAt: new Date(data.createdAt).toISOString(),
        issues: issues.map((i: any) => ({
          severity: i.severity,
          title: i.title,
          message: i.message,
          ruleId: i.ruleId,
          rootCause: i.rootCause || null,
        })),
        tbmSummary: report?.tbmSummary || "",
        tbmTranscript: report?.tbmTranscript || "",

        summary: {
          totalIssues: issues.length,
          criticalCount: issues.filter((i: any) => i.severity === "error").length,
          warningCount: issues.filter((i: any) => i.severity === "warn").length,
          infoCount: issues.filter((i: any) => i.severity === "info").length,
        },
        projectId: currentProjectId,
      };

      const response = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "report.pdf";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
        if (filenameMatch?.[1]) filename = decodeURIComponent(filenameMatch[1]);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("PDF 리포트를 다시 다운로드했습니다");
    } catch (error: any) {
      try {
        if (!exportData) throw error;

        if (exportData.documentType === "TBM") {
          throw new Error("TBM 브라우저 PDF fallback은 아직 지원되지 않습니다 (서버 export 필요)");
        }

        await exportReportToPDF({
          fileName: exportData.fileName,
          projectName: exportData.projectName,
          documentType: exportData.documentType ?? null,
          createdAt: new Date(exportData.createdAt),
          issues: exportData.issues.map((i: any) => ({
            severity: i.severity,
            title: i.title,
            message: i.message,
            ruleId: i.ruleId,
            rootCause: i.rootCause || null,
          })),
          summary: exportData.summary,
        } as any);

        toast.success("브라우저에서 PDF를 생성했습니다");
      } catch (fallbackError: any) {
        showError(ErrorMessages.PDF_EXPORT_FAILED(fallbackError.message), () => exportReportFromHistory(id));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject({
    name,
    description,
    file,
    templateId,
  }: {
    name: string;
    description: string;
    file: File | null;
    templateId?: string;
  }) {
    try {
      let contextText = "";
      if (file) {
        const controller = new AbortController();
        contextText = await extractPdfText(file, controller.signal);
      }

      let masterPlanJson: string | null = null;
      let isStructured = false;

      if (templateId && TEMPLATES[templateId]) {
        // Use the selected template
        masterPlanJson = JSON.stringify(TEMPLATES[templateId]);
        isStructured = true;
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          contextText,
          masterPlanJson,
          isStructured
        }),
      });

      if (!res.ok) throw new Error("Failed");

      const newProject = await res.json();
      setProjects((prev) => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
      dismissWelcome();
    } catch (error) {
      showError(ErrorMessages.PROJECT_CREATE_FAILED());
      throw error;
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete project");
      }

      const projectToDelete = projects.find((p) => p.id === projectId);
      const projectName = projectToDelete ? projectToDelete.name : "프로젝트";

      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
        setShowWelcome(true);
        performClearFile(); // Clear without confirmation when deleting project
      }

      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      toast.success(`"${projectName}" 프로젝트가 삭제되었습니다`);
    } catch (error) {
      showError(ErrorMessages.PROJECT_DELETE_FAILED());
      throw error;
    }
  }

  async function handleUpdateProject(
    projectId: string,
    data: { name: string; description: string; file: File | null }
  ) {
    try {
      let contextText: string | undefined = undefined;
      if (data.file) {
        const controller = new AbortController();
        contextText = await extractPdfText(data.file, controller.signal);
      }

      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          ...(contextText !== undefined && { contextText }),
        }),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updatedProject = await res.json();
      setProjects((prev) => prev.map((p) => (p.id === projectId ? updatedProject : p)));
    } catch (error) {
      throw error;
    }
  }

  function handleOpenEditProject(project: { id: string; name: string; description: string }) {
    setEditingProject(project);
    setIsEditProjectModalOpen(true);
  }

  async function handleUploadTempMasterDoc(file: File) {
    try {
      const controller = new AbortController();
      const text = await extractPdfText(file, controller.signal);
      const tempDoc = { text, fileName: file.name };
      setTempMasterDoc(tempDoc);
      await set("temp_master_doc", tempDoc);
      toast.success(`임시 마스터 문서 "${file.name}"이(가) 업로드되었습니다`);
      setShowTempMasterModal(false);
    } catch (error) {
      console.error("Failed to upload temp master doc", error);
      showError(ErrorMessages.TEMP_MASTER_DOC_UPLOAD_FAILED());
    }
  }

  async function handleClearTempMasterDoc() {
    setTempMasterDoc(null);
    await del("temp_master_doc");
    toast.success("임시 마스터 문서가 삭제되었습니다");
  }

  // Generate namespaced IndexedDB key to prevent collisions
  // Format: "p:{projectId}:{key}" or "np:{key}" (no-project)
  // Using ':' as delimiter prevents collisions with UUID format
  function getProjectKey(key: string) {
    return currentProjectId ? `p:${currentProjectId}:${key}` : `np:${key}`;
  }

  function clearDocumentState() {
    setFile(null);
    setPageImages([]);
    setReport(null);
    setCurrentPage(0);
    setHistoricalFileName(undefined);
    setCurrentReportId(undefined);
    setImageQuality(null);
    // Clear TBM and photo findings for fresh start
    setLatestTBM(null);
    setLatestPhotoFindings(null);
  }

  async function loadCurrentProjectState() {
    try {
      // ✅ Load all state in parallel for faster project switching
      const [savedFile, savedImages, savedReport, savedPage, savedHiddenIssues, savedLocalChat] = await Promise.all([
        get(getProjectKey("file")),
        get(getProjectKey("images")),
        get(getProjectKey("report")),
        get(getProjectKey("page")),
        get(getProjectKey("hiddenIssues")),
        get(getProjectKey("localChat")),
      ]);

      if (savedFile || savedReport) {
        setFile(savedFile || null);
        setPageImages(savedImages || []);
        setReport(savedReport || null);
        setCurrentPage(savedPage || 0);
        setHistoricalFileName(undefined);
        setCurrentReportId(undefined);

        // Restore hidden issues
        if (savedHiddenIssues) {
          setHiddenIssueIds(savedHiddenIssues);
        } else {
          setHiddenIssueIds([]);
        }

        // Restore local chat messages
        if (savedLocalChat) {
          setLocalChatMessages(savedLocalChat);
        } else {
          setLocalChatMessages([]);
        }

        // Progress state is NOT restored - it's ephemeral and only relevant during active validation
      } else {
        // Skip clearing state if a file is being actively processed (race condition prevention)
        // This handles the case where user uploads a file and showWelcome changes before
        // the file state is persisted to IndexedDB
        if (!pendingFile && !showDocTypeSelector) {
          clearDocumentState();
        }
      }
    } catch (e) {
      console.error("Failed to load project state", e);
      // Only clear on error if not actively processing a file
      if (!pendingFile && !showDocTypeSelector) {
        clearDocumentState();
      }
    }
  }

  useEffect(() => {
    loadCurrentProjectState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, showWelcome]);

  useEffect(() => {
    if (file) set(getProjectKey("file"), file);
    else del(getProjectKey("file"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, currentProjectId]);

  useEffect(() => {
    if (pageImages.length > 0) set(getProjectKey("images"), pageImages);
    else del(getProjectKey("images"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageImages, currentProjectId]);

  useEffect(() => {
    if (report) set(getProjectKey("report"), report);
    else del(getProjectKey("report"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, currentProjectId]);

  useEffect(() => {
    if (currentPage > 0) set(getProjectKey("page"), currentPage);
    else del(getProjectKey("page"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, currentProjectId]);

  // NOTE: Progress state (validationStep, showProgress) is NOT persisted
  // It's ephemeral and only relevant during active validation

  useEffect(() => {
    // Persist hidden issues (dismissed by user)
    if (hiddenIssueIds.length > 0) {
      set(getProjectKey("hiddenIssues"), hiddenIssueIds);
    } else {
      del(getProjectKey("hiddenIssues"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenIssueIds, currentProjectId]);

  useEffect(() => {
    // Persist local chat messages
    if (localChatMessages.length > 0) {
      set(getProjectKey("localChat"), localChatMessages);
    } else {
      del(getProjectKey("localChat"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localChatMessages, currentProjectId]);

  function handleClearFile() {
    // Show confirmation if file exists
    if (file) {
      setConfirmClearFile(true);
      return;
    }
    performClearFile();
  }

  function performClearFile() {
    clearDocumentState();
    del(getProjectKey("file"));
    del(getProjectKey("images"));
    del(getProjectKey("report"));
    del(getProjectKey("page"));
    del(getProjectKey("hiddenIssues"));
    del(getProjectKey("localChat"));
  }

  function handleWelcomeCreateProject() {
    dismissWelcome();
    setIsProjectModalOpen(true);
  }

  function handleWelcomeSelectProject(projectId: string) {
    dismissWelcome();
    setCurrentProjectId(projectId);
  }

  function handleWelcomeProceedWithoutProject() {
    dismissWelcome();
    setCurrentProjectId(null);
  }

  function handleProjectChange(projectId: string | null) {
    // Show confirmation if switching projects with unsaved work
    if (file && projectId !== currentProjectId) {
      setConfirmProjectSwitch({ projectId });
      return;
    }
    performProjectChange(projectId);
  }

  function performProjectChange(projectId: string | null) {
    if (showWelcome) {
      dismissWelcome();
    }
    setCurrentProjectId(projectId);
  }

  // Show loading state while checking first visit
  if (checkingFirstVisit) {
    return (
      <div className="flex flex-col h-dvh bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 items-center justify-center">
        <div className="inline-flex items-center justify-center size-20 bg-primary rounded-2xl text-white shadow-2xl shadow-primary/30 mb-6 animate-pulse">
          <span className="material-symbols-outlined text-5xl">safety_check</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh bg-slate-50 dark:bg-gray-900 relative overflow-hidden">
      <NewProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <EditProjectModal
        isOpen={isEditProjectModalOpen}
        project={editingProject}
        onClose={() => {
          setIsEditProjectModalOpen(false);
          setEditingProject(null);
        }}
        onUpdate={handleUpdateProject}
      />

      <TempMasterDocModal
        isOpen={showTempMasterModal}
        onClose={() => setShowTempMasterModal(false)}
        onUpload={handleUploadTempMasterDoc}
        currentDoc={tempMasterDoc}
        onClear={handleClearTempMasterDoc}
      />

      <ProjectDashboard
        isOpen={showDashboard}
        onClose={() => setShowDashboard(false)}
        projectId={currentProjectId}
        projectName={projects.find((p) => p.id === currentProjectId)?.name}
        onOpenNewProject={() => {
          setShowDashboard(false);
          setIsProjectModalOpen(true);
        }}
      />

      <DocumentTypeSelector
        isOpen={showDocTypeSelector}
        fileName={pendingFile?.name ?? ""}
        onSelect={handleDocTypeSelect}
        onAutoDetect={handleDocTypeAutoDetect}
      />

      <TBMRecorderModal
        open={tbmOpen}
        mode={tbmMode}
        projectId={currentProjectId}
        onClose={() => setTbmOpen(false)}
        onComplete={async (r) => {
          console.log("[TBM onComplete] Starting...", r);

          // Save to database
          await saveTBMHistory(r);
          console.log("[TBM onComplete] Saved to database");

          // Small delay to ensure database write completes
          await new Promise(resolve => setTimeout(resolve, 100));

          // Set latest TBM context for validation
          setLatestTBM({
            summary: r.summary || "",
            transcript: r.transcript || "",
            workType: r.workType || null,
            extractedHazards: r.extractedHazards || [],
            extractedInspector: r.extractedInspector || null,
          });

          // Close modal
          setTbmOpen(false);
          dismissWelcome();

          // Auto-switch to TBM Timeline tab (set loading first to prevent flash)
          setLoadingTBMs(true);
          setActiveTab("tbm");
          console.log("[TBM onComplete] Switched to TBM tab");

          // Reload TBM records to show the new one
          console.log("[TBM onComplete] Loading TBM records...");
          await loadTBMRecords();
          console.log("[TBM onComplete] TBM records loaded");

          // Show success toast with extracted info
          const workTypeText = r.workType ? `"${r.workType}"` : "TBM";
          const hazardCount = r.extractedHazards?.length || 0;
          const hazardText = hazardCount > 0 ? ` (${hazardCount}개 위험요인 감지)` : "";
          toast.success(`${workTypeText} 녹음이 완료되었습니다${hazardText}`, 4000);
        }}

      />

      <TBMResultModal open={tbmResultOpen} data={tbmResult} onClose={() => setTbmResultOpen(false)} />

      <ConfirmDialog
        isOpen={confirmClearFile}
        onClose={() => setConfirmClearFile(false)}
        onConfirm={performClearFile}
        title="파일 삭제 확인"
        message={`현재 업로드된 파일 "${file?.name}"을(를) 삭제하시겠습니까?\n\n검증 결과와 분석 내용이 모두 사라집니다.`}
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!confirmProjectSwitch}
        onClose={() => setConfirmProjectSwitch(null)}
        onConfirm={() => {
          if (confirmProjectSwitch) {
            performProjectChange(confirmProjectSwitch.projectId);
            setConfirmProjectSwitch(null);
          }
        }}
        title="프로젝트 전환 확인"
        message={`현재 작업 중인 파일이 있습니다.\n프로젝트를 전환하시겠습니까?\n\n현재 파일: ${file?.name}\n\n프로젝트를 전환하면 현재 작업 내용이 저장되지 않을 수 있습니다.`}
        confirmText="전환"
        cancelText="취소"
        variant="warning"
      />

      <Header
        key={projectSelectorKey}
        loading={loading}
        reportExists={!!report}
        isLoadingProjects={isLoadingProjects}
        onShowHistory={() => setShowHistory(true)}
        onShowDashboard={() => setShowDashboard(true)}
        toggleDark={toggleDark}
        showWelcome={showWelcome}
        projects={projects}
        currentProjectId={currentProjectId}
        onProjectChange={handleProjectChange}
        onOpenNewProject={() => setIsProjectModalOpen(true)}
        onDeleteProject={handleDeleteProject}
        onEditProject={handleOpenEditProject}
        onShowWelcome={showWelcomeScreen}
        currentFileName={file?.name}
        hasTempMasterDoc={!!tempMasterDoc}
        onOpenTempMasterDoc={() => setShowTempMasterModal(true)}
        onStartTBM={startTBM}
        onUpload={pickFileDialog}
      />

      {showProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 w-full max-w-3xl border border-slate-200 dark:border-slate-700">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6 text-center">
              문서 검증 중...
            </h3>
            <ProgressBar currentStep={validationStep} steps={validationSteps} />
          </div>
        </div>
      )}

      <HistorySidebar
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectReport={loadReportFromHistory}
        onExportReport={exportReportFromHistory}
        currentProjectId={currentProjectId}
        onHistoryChange={() => setHistoryVersion(v => v + 1)}
      />

      {showWelcome ? (
        <WelcomeScreen
          projects={projects}
          isLoadingProjects={isLoadingProjects}
          onCreateProject={handleWelcomeCreateProject}
          onSelectProject={handleWelcomeSelectProject}
          onProceedWithoutProject={handleWelcomeProceedWithoutProject}
          onDeleteProject={handleDeleteProject}
        />
      ) : (
        <>
          {/* Tab Switcher */}
          <div className="flex items-center gap-2 px-6 pt-4 pb-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <button
              onClick={() => setActiveTab("document")}
              className={`px-4 py-2 rounded-t-lg font-medium transition ${activeTab === "document"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                }`}
            >
              📄 문서 검증
            </button>
            <button
              onClick={() => {
                // Set loading true immediately to prevent flash of "no records" state
                setLoadingTBMs(true);
                setActiveTab("tbm");
              }}
              className={`px-4 py-2 rounded-t-lg font-medium transition ${activeTab === "tbm"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600"
                }`}
            >
              🎤 TBM 타임라인 {tbmRecords.length > 0 && `(${tbmRecords.length})`}
            </button>
          </div>

          {activeTab === "document" ? (
            <>
              <div className="hidden lg:flex flex-1 min-h-0 w-full">
                {file || report ? (
                  <ThreeColumnLayout
                    forceActivePanel={forceAnalysisPanel}
                    onActivePanelChange={() => setForceAnalysisPanel(null)}
                    left={
                      <IssuesList
                        issues={report?.issues ?? []}
                        loading={loading}
                        hasUnviewedIssues={hasUnviewedIssues}
                        onMarkIssuesViewed={() => setHasUnviewedIssues(false)}
                        onCorrectiveAction={(issue) => {
                          const severityKo = issue.severity === "error" ? "심각" : issue.severity === "warn" ? "경고" : "정보";
                          const message = `이 문제에 대한 시정조치 요청서를 작성해주세요:\n\n제목: ${issue.title}\n심각도: ${severityKo}\n상세: ${issue.message}${issue.ruleId ? `\n규칙: ${issue.ruleId}` : ""}`;
                          setChatExternalMessage(message);
                          // Switch to AI analysis tab to show the chat
                          setForceAnalysisPanel("analysis");
                        }}
                      />
                    }
                    center={
                      <DocumentViewer
                        file={file}
                        pageImages={pageImages}
                        reportIssues={report?.issues ?? []}
                        currentPage={currentPage}
                        onPageChange={setCurrentPage}
                        onPickFile={pickFileDialog}
                        onFileSelect={onPickFile}
                        onStartTBM={startTBM}
                        onClearFile={handleClearFile}
                        historicalFileName={historicalFileName}
                        documentType={report?.documentType}
                        currentProjectId={currentProjectId}
                        currentReportId={currentReportId}
                        onLoadDocument={loadReportFromHistory}
                        tbmSummary={report?.tbmSummary || latestTBM?.summary}
                        tbmTranscript={report?.tbmTranscript || latestTBM?.transcript}
                        imageQuality={imageQuality}
                        historyRefreshKey={historyVersion}
                      />
                    }
                    right={
                      <ChatPanel
                        messages={report?.chat ?? []}
                        loading={loading}
                        currentProjectName={projects.find((p) => p.id === currentProjectId)?.name}
                        currentFile={file}
                        historicalFileName={historicalFileName}
                        issues={report?.issues ?? []}
                        tbmSummary={report?.tbmSummary || latestTBM?.summary || ""}
                        tbmTranscript={report?.tbmTranscript || latestTBM?.transcript || ""}
                        documentType={report?.documentType ?? null}
                        reportContext={report ? {
                          docType: (report as any).docType,
                          fields: (report as any).fields,
                          signature: (report as any).signature,
                          inspectorName: (report as any).inspectorName,
                          riskLevel: (report as any).riskLevel,
                          checklist: (report as any).checklist,
                          issues: report.issues,
                          tbmContext: latestTBM ? {
                            workType: latestTBM.workType || null,
                            extractedHazards: latestTBM.extractedHazards || [],
                            extractedInspector: latestTBM.extractedInspector || null,
                            participants: [],
                            summary: latestTBM.summary,
                          } : null,
                          photoFindings: latestPhotoFindings || null,
                        } : null}
                        externalMessage={chatExternalMessage}
                        onExternalMessageSent={() => setChatExternalMessage(null)}
                      />



                    }
                  />
                ) : (
                  <div className="flex-1 overflow-hidden">
                    <DocumentViewer
                      file={file}
                      pageImages={pageImages}
                      reportIssues={[]}
                      currentPage={currentPage}
                      onPageChange={setCurrentPage}
                      onPickFile={pickFileDialog}
                      onFileSelect={onPickFile}
                      onStartTBM={startTBM}
                      onClearFile={handleClearFile}
                      historicalFileName={historicalFileName}
                      documentType={null}
                      currentProjectId={currentProjectId}
                      currentReportId={currentReportId}
                      onLoadDocument={loadReportFromHistory}
                      tbmSummary={undefined}
                      tbmTranscript={undefined}
                      imageQuality={imageQuality}
                      historyRefreshKey={historyVersion}
                    />
                  </div>
                )}
              </div>

              <div className="flex lg:hidden flex-1 overflow-hidden">
                <ResizableSplitLayout
                  initialLeftWidthPercent={70}
                  left={
                    <DocumentViewer
                      file={file}
                      pageImages={pageImages}
                      reportIssues={report?.issues ?? []}
                      currentPage={currentPage}
                      onPageChange={setCurrentPage}
                      onPickFile={pickFileDialog}
                      onFileSelect={onPickFile}
                      onStartTBM={startTBM}
                      onClearFile={handleClearFile}
                      historicalFileName={historicalFileName}
                      documentType={report?.documentType}
                      currentProjectId={currentProjectId}
                      currentReportId={currentReportId}
                      onLoadDocument={loadReportFromHistory}
                      tbmSummary={report?.tbmSummary || latestTBM?.summary}
                      tbmTranscript={report?.tbmTranscript || latestTBM?.transcript}
                      imageQuality={imageQuality}
                      historyRefreshKey={historyVersion}
                    />
                  }
                  right={
                    <AnalysisPanel
                      loading={loading}
                      issues={report?.issues ?? []}
                      chatMessages={report?.chat ?? []}
                      onReupload={pickFileDialog}
                      onModify={() => toast.info("수정 기능은 곧 출시됩니다", 2000)}
                      currentProjectName={projects.find((p) => p.id === currentProjectId)?.name}
                      currentFile={file}
                      historicalFileName={historicalFileName}
                      tbmSummary={report?.tbmSummary || latestTBM?.summary || ""}
                      tbmTranscript={report?.tbmTranscript || latestTBM?.transcript || ""}
                      validationStep={validationStep}
                      showProgress={showProgress}
                      validationSteps={validationSteps}
                      initialHiddenIssueIds={hiddenIssueIds}
                      onHiddenIssuesChange={setHiddenIssueIds}
                      hasUnviewedIssues={hasUnviewedIssues}
                      onMarkIssuesViewed={() => setHasUnviewedIssues(false)}
                      initialLocalChatMessages={localChatMessages}
                      onLocalChatMessagesChange={setLocalChatMessages}
                      reportContext={report ? {
                        docType: (report as any).docType,
                        fields: (report as any).fields,
                        signature: (report as any).signature,
                        inspectorName: (report as any).inspectorName,
                        riskLevel: (report as any).riskLevel,
                        checklist: (report as any).checklist,
                        issues: report.issues,
                        projectContext: {
                          projectName: projects.find((p) => p.id === currentProjectId)?.name || null,
                          masterPlanSummary: null,
                        },
                        tbmContext: latestTBM ? {
                          workType: latestTBM.workType || null,
                          extractedHazards: latestTBM.extractedHazards || [],
                          extractedInspector: latestTBM.extractedInspector || null,
                          participants: [],
                          summary: latestTBM.summary,
                        } : null,
                        photoFindings: latestPhotoFindings || null,
                      } : null}
                      fallHazardStatus={report?.fallHazardStatus}
                    />
                  }
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-hidden">
              <TBMTimeline
                tbmRecords={tbmRecords}
                loading={loadingTBMs}
                onSelectTBM={(record) => {
                  setLatestTBM({
                    summary: record.tbmSummary,
                    transcript: record.tbmTranscript,
                    workType: record.tbmWorkType,
                    extractedHazards: record.tbmExtractedHazards ? JSON.parse(record.tbmExtractedHazards) : [],
                    extractedInspector: record.tbmExtractedInspector,
                  });
                  setActiveTab("document");
                  toast.success("TBM이 선택되었습니다. 문서를 업로드하여 검증하세요.", 3000);
                }}
                onRefresh={loadTBMRecords}
                onDelete={deleteTBM}
                onDeleteAll={deleteAllTBMs}
              />
            </div>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.currentTarget.value = "";
          isPickingRef.current = false;
        }}
      />

      {/* Error Dialog */}
      {errorDialog && (
        <ErrorDialog
          error={errorDialog.error}
          onClose={() => setErrorDialog(null)}
          onRetry={errorDialog.onRetry}
        />
      )}
      {/* Note: ProjectDashboard is rendered once earlier in the component tree (line ~1619) */}
    </div>
  );
}
