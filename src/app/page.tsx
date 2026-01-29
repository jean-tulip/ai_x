
"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import DocumentViewer from "@/components/viewer/DocumentViewer";
import AnalysisPanel from "@/components/analysis/AnalysisPanel";
import ResizableSplitLayout from "@/components/layout/ResizableSplitLayout";
import HistorySidebar from "@/components/HistorySidebar";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { DocumentTypeSelector } from "@/components/DocumentTypeSelector";
import TBMRecorderModal from "@/components/TBMRecorderModal";
import { EditProjectModal } from "@/components/EditProjectModal";
import { ProjectDashboard } from "@/components/ProjectDashboard";
import { Issue } from "@/lib/validator"; // Assumed shared type, might need fixing if validator.ts export is slightly different
import { get, set, del } from "idb-keyval";
import { useToast } from "@/contexts/ToastContext";
import { DocumentType } from "@/lib/documentTypes";

// Type Definitions (Re-using some from validator or defining locally for now if implicit)
// In validator.ts we have type Severity? Checking previous read..
// validator.ts exported DocData and ValidationIssue.
// Let's create a local type for Report compatible with page state
type Report = {
  fileName: string;
  issues: any[]; // ValidationIssue[]
  chat: { role: "ai" | "user"; text: string }[];
  documentType?: string | null;
};

// Simple Modal Component
function NewProjectModal({ isOpen, onClose, onCreate }: { isOpen: boolean; onClose: () => void; onCreate: (data: any) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onCreate({ name, description, file });
      onClose();
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-700">
        <h3 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">New Project</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Name</label>
            <input
              required
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Gimpo Han River Site A"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
            <input
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              마스터 안전 계획서 (선택사항)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="application/pdf"
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-800 dark:text-blue-300 font-medium mb-1">
                💡 이 문서는 무엇인가요?
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                프로젝트의 <strong>안전 규칙 및 기준</strong>을 담은 PDF입니다. AI가 이 기준을 참고하여 제출된 점검 문서를 검증합니다.
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                ⚠️ 이 파일은 검증 대상이 아닙니다. 프로젝트 생성 후 별도로 점검 문서를 업로드하세요.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancel</button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);
  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [historicalFileName, setHistoricalFileName] = useState<string | undefined>(undefined);
  const [showDocTypeSelector, setShowDocTypeSelector] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | null>(null);
  const [showTBMModal, setShowTBMModal] = useState(false);

  // Reset page when file changes
  useEffect(() => {
    setCurrentPage(0);
  }, [file, pageImages]);

  // Project State
  const [projects, setProjects] = useState<any[]>([]); // Should use Project type
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("current_project_id");
    }
    return null;
  });
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; description: string } | null>(null);
  const [projectSelectorKey, setProjectSelectorKey] = useState(0); // To force refresh
  // Initialize welcome state from localStorage on client only to avoid hydration mismatch
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window !== "undefined") {
      const showWelcomeState = localStorage.getItem("show_welcome");
      // If explicitly set, use that value
      if (showWelcomeState !== null) {
        return showWelcomeState === "true";
      }
      // Otherwise, show welcome if no project exists
      const hasProject = localStorage.getItem("current_project_id");
      return !hasProject;
    }
    return false; // Default to false on server to avoid hydration issues
  });

  useEffect(() => {
    fetchProjects();
  }, [projectSelectorKey]);

  // Persist currentProjectId
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (currentProjectId) {
        localStorage.setItem("current_project_id", currentProjectId);
      } else {
        localStorage.removeItem("current_project_id");
      }
    }
  }, [currentProjectId]);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch projects");
    }
  }

  // PDF Worker Init (keep this here or move to a hook, keep here for simplicity)
  let pdfjsPromise: Promise<any> | null = null;
  async function getPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
        (pdfjs as any).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        return pdfjs;
      });
    }
    return pdfjsPromise;
  }

  // --- File Logic ---
  useEffect(() => {
    if (!file) {
      setPageImages([]);
      return;
    }
    // Logic moved from old useEffect, actually renderPdfPages handles PDF
    // But for Image type we need this:
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPageImages([url]);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  function toggleDark() {
    document.documentElement.classList.toggle("dark");
  }

  function pickFileDialog() {
    fileInputRef.current?.click();
  }

  function startTBM() {
    // TBM은 업로드 검증과 별개 흐름
    dismissWelcome();
    setShowTBMModal(true);
  }

  async function renderPdfPages(pdfFile: File, requestId: number) {
    const pdfjs = await getPdfjs();
    const buf = await pdfFile.arrayBuffer();
    const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;

    const images: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      // Optimized scale for viewing
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL("image/jpeg"));
    }
    if (requestId === requestIdRef.current) {
      setPageImages(images);
    }
    return images;
  }

  async function extractPdfText(pdfFile: File) {
    const pdfjs = await getPdfjs();
    const buf = await pdfFile.arrayBuffer();
    const pdf = await (pdfjs as any).getDocument({ data: buf }).promise;
    let full = "";
    for (let p = 1; p <= pdf.numPages; p++) {
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
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let text = "";
      let images: string[] = [];

      if (f.type === "application/pdf") {
        images = await renderPdfPages(f, requestId);
        if (requestId !== requestIdRef.current) return;
        text = await extractPdfText(f);
        if (requestId !== requestIdRef.current) return;
      } else if (f.type.startsWith("image/")) {
        // Logic to get dataURL from file object for API
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(f);
        });
        images = [dataUrl];
        if (requestId !== requestIdRef.current) return;
      }

      // Token Opt: First + Last
      let imagesToSend: string[] = [];
      if (images.length > 0) {
        imagesToSend.push(images[0]);
        if (images.length > 1) {
          imagesToSend.push(images[images.length - 1]);
        }
      }

      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: f.name,
          pdfText: text,
          pageImages: imagesToSend,
          projectId: currentProjectId, // Pass context
          documentType: documentType // Pass document type
        })
      });

      const data = (await res.json()) as Report;
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) {
        // Handle error response structure from API
        throw new Error((data as any).error || "Unknown server error");
      }

      // Ensure IDs exist (client-side patch for legacy/migration)
      data.issues = data.issues.map((i: any) => ({ ...i, id: i.id || crypto.randomUUID() }));

      // Include documentType in report
      if (requestId === requestIdRef.current) {
        setReport({
          ...data,
          documentType: documentType
        });
      }
    } catch (e: any) {
      if (requestId === requestIdRef.current) {
        console.error(e);
        setReport({
          fileName: f.name,
          issues: [
            {
              id: crypto.randomUUID(), // Ensure ID for fallback error too
              severity: "error",
              title: "검증 실패",
              message: e?.message || "오류가 발생했습니다."
            }
          ],
          chat: [{ role: "ai", text: `오류가 발생했어요: ${e?.message}` }]
        });
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  async function onPickFile(f: File) {
    dismissWelcome(); // Dismiss welcome screen when file is uploaded
    setFile(f);
    setReport(null);
    setHistoricalFileName(undefined); // Clear historical flag

    // Check if user wants to skip document type selector
    const skipSelector = typeof window !== "undefined" && localStorage.getItem("skip_document_type_selector") === "true";

    if (skipSelector) {
      // Skip selector and validate immediately
      await runValidation(f, null);
    } else {
      // Show document type selector before validation
      setPendingFile(f);
      setShowDocTypeSelector(true);
    }
  }

  async function handleDocTypeSelect(type: DocumentType) {
    setSelectedDocType(type);
    setShowDocTypeSelector(false);
    if (pendingFile) {
      await runValidation(pendingFile, type);
      setPendingFile(null);
    }
  }

  function handleDocTypeSkip() {
    setShowDocTypeSelector(false);
    if (pendingFile) {
      runValidation(pendingFile, null);
      setPendingFile(null);
    }
  }

  // History Load Logic
  async function loadReportFromHistory(id: string) {
    setLoading(true);
    setShowHistory(false); // Close sidebar
    dismissWelcome(); // Dismiss welcome when loading history
    try {
      const res = await fetch(`/api/history?id=${id}`);
      if (!res.ok) throw new Error("Failed to load report");
      const data = await res.json();

      // Transform DB schema to UI schema
      // docDataJson and issuesJson are strings, need parsing
      let issues = JSON.parse(data.issuesJson);
      const extracted = JSON.parse(data.docDataJson);

      // Ensure IDs exist for history items
      issues = issues.map((i: any) => ({ ...i, id: i.id || crypto.randomUUID() }));

      // Create a more informative chat message
      const issueCount = issues.length;
      const criticalIssues = issues.filter((i: any) => i.severity === "error").length;
      const chatText = `검증 기록 불러오기 완료\n\n파일명: ${data.fileName}\n발견된 문제: ${issueCount}개\n심각한 문제: ${criticalIssues}개\n\n참고: 과거 기록은 원본 이미지가 보존되지 않습니다.`;

      setReport({
        fileName: data.fileName,
        issues: issues,
        chat: [{ role: "ai", text: chatText }],
        documentType: data.documentType ?? null
      });

      // We don't have the file, so clear it and set historical flag
      setFile(null);
      setPageImages([]);
      setHistoricalFileName(data.fileName);
      toast.success("검증 기록을 불러왔습니다");
    } catch (e) {
      toast.error("기록을 불러오는 데 실패했습니다");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject({ name, description, file }: { name: string; description: string; file: File | null }) {
    try {
      let contextText = "";
      if (file) {
        // Extract text from Master Plan
        contextText = await extractPdfText(file);
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, contextText })
      });

      if (!res.ok) throw new Error("Failed");

      const newProject = await res.json();

      // Immediately add the new project to the projects list
      setProjects(prev => [...prev, newProject]);

      // Set as current project
      setCurrentProjectId(newProject.id);

      // Ensure welcome screen is dismissed
      dismissWelcome();

      toast.success(`프로젝트 "${name}"이(가) 생성되었습니다. 이제 검증할 문서를 업로드하세요.`);
    } catch (error) {
      toast.error("프로젝트 생성에 실패했습니다");
      throw error;
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete project");
      }

      // If we deleted the current project, reset to null
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
      }

      // Immediately remove the project from the list
      setProjects(prev => prev.filter(p => p.id !== projectId));

      toast.success("프로젝트가 삭제되었습니다");
    } catch (error) {
      toast.error("프로젝트 삭제에 실패했습니다");
      throw error;
    }
  }

  async function handleUpdateProject(projectId: string, data: { name: string; description: string; file: File | null }) {
    try {
      let contextText = undefined;
      if (data.file) {
        contextText = await extractPdfText(data.file);
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

      // Immediately update the project in the list
      setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));

      // Note: toast notification is handled in the modal
    } catch (error) {
      throw error;
    }
  }

  function handleOpenEditProject(project: { id: string; name: string; description: string }) {
    setEditingProject(project);
    setIsEditProjectModalOpen(true);
  }

  // --- Persistence Logic ---
  useEffect(() => {
    // Load state from DB on mount
    async function loadState() {
      try {
        const savedFile = await get("current_file");
        const savedImages = await get("current_images");
        const savedReport = await get("current_report");
        const savedPage = await get("current_page");

        if (savedFile) setFile(savedFile);
        if (savedImages) setPageImages(savedImages);
        if (savedReport) setReport(savedReport);
        if (savedPage) setCurrentPage(savedPage);
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }
    loadState();
  }, []); // Run once on mount

  // Auto-save effects - also clear DB when values are cleared
  useEffect(() => {
    if (file) {
      set("current_file", file);
    } else {
      del("current_file");
    }
  }, [file]);

  useEffect(() => {
    if (pageImages.length > 0) {
      set("current_images", pageImages);
    } else {
      del("current_images");
    }
  }, [pageImages]);

  useEffect(() => {
    if (report) {
      set("current_report", report);
    } else {
      del("current_report");
    }
  }, [report]);

  // Debounce page save slightly if needed, or just save (it's small)
  useEffect(() => {
    if (currentPage > 0) {
      set("current_page", currentPage);
    } else {
      del("current_page");
    }
  }, [currentPage]);


  function handleClearFile() {
    setFile(null);
    setPageImages([]);
    setReport(null);
    setCurrentPage(0);
    setHistoricalFileName(undefined);

    // Clear DB
    del("current_file");
    del("current_images");
    del("current_report");
    del("current_page");
  }

  function dismissWelcome() {
    setShowWelcome(false);
    localStorage.setItem("show_welcome", "false");
  }

  function showWelcomeScreen() {
    setShowWelcome(true);
    localStorage.setItem("show_welcome", "true");
    // Clear current work when going back to welcome
    handleClearFile();
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

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-gray-900 overflow-hidden relative">
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
      <ProjectDashboard
        isOpen={showDashboard}
        onClose={() => setShowDashboard(false)}
        projectId={currentProjectId}
        projectName={projects.find(p => p.id === currentProjectId)?.name}
      />
      <DocumentTypeSelector
        isOpen={showDocTypeSelector}
        fileName={pendingFile?.name ?? ""}
        onSelect={handleDocTypeSelect}
        onSkip={handleDocTypeSkip}
      />

      <TBMRecorderModal
        isOpen={showTBMModal}
        projectId={currentProjectId}
        onClose={() => setShowTBMModal(false)}
        onComplete={(r) => {
          // TBM은 파일 업로드가 아니라 별도 흐름이므로
          // 분석 결과를 오른쪽 패널(채팅/요약)에 표시한다.
          dismissWelcome();
          setFile(null);
          setPageImages([]);
          setHistoricalFileName(undefined);
          setReport({
            fileName: "TBM(작업 전 대화)",
            issues: [],
            chat: [
              { role: "ai", text: r.summary || "(요약 결과가 비어있어요)" },
              ...(r.transcript ? [{ role: "ai", text: `\n\n[전사본]\n${r.transcript}` }] : []),
            ],
            documentType: "TBM",
          });
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickFile(f);
        }}
      />

      <Header
        key={projectSelectorKey}
        loading={loading}
        reportExists={!!report}
        onUpload={pickFileDialog}
        onStartTBM={() => {
          dismissWelcome();
          setShowTBMModal(true);
        }}
        onShowHistory={() => setShowHistory(true)}
        onShowDashboard={() => setShowDashboard(true)}
        toggleDark={toggleDark}
        showWelcome={showWelcome}
        projects={projects}
        currentProjectId={currentProjectId}
        onProjectChange={setCurrentProjectId}
        onOpenNewProject={() => setIsProjectModalOpen(true)}
        onDeleteProject={handleDeleteProject}
        onEditProject={handleOpenEditProject}
        onShowWelcome={showWelcomeScreen}
      />

      <HistorySidebar
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onSelectReport={loadReportFromHistory}
      />

      {showWelcome && !file ? (
        <WelcomeScreen
          projects={projects}
          onCreateProject={handleWelcomeCreateProject}
          onSelectProject={handleWelcomeSelectProject}
          onProceedWithoutProject={handleWelcomeProceedWithoutProject}
        />
      ) : (
        <ResizableSplitLayout
        left={
          <DocumentViewer
            file={file}
            pageImages={pageImages}
            reportIssues={report?.issues ?? []}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onPickFile={pickFileDialog}
            onStartTBM={() => {
              dismissWelcome();
              setShowTBMModal(true);
            }}
            onClearFile={handleClearFile}
            historicalFileName={historicalFileName}
            documentType={report?.documentType}
          />
        }
        right={
          <AnalysisPanel
            loading={loading}
            issues={report?.issues ?? []}
            chatMessages={report?.chat ?? []}
            onReupload={pickFileDialog}
            onModify={() => toast.info("수정 기능은 곧 출시됩니다", 2000)}
            currentProjectName={projects.find(p => p.id === currentProjectId)?.name}
            currentFile={file}
          />
        }
      />
      )}
    </div>
  );
}
