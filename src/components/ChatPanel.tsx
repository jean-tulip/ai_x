"use client";

import { useState, useRef, useEffect } from "react";
import { useToast } from "@/contexts/ToastContext";
import { exportReportToPDF } from "@/lib/pdfExport";
import { classifyUserMessage } from "@/lib/chatMessageClassifier";
import { markdownToReactHtml } from "@/lib/simpleMarkdown";

interface ChatMessage {
  role: "ai" | "user";
  text: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  loading?: boolean;
  currentProjectName?: string;
  currentFile?: File | null;
  historicalFileName?: string;
  issues?: any[];

  documentType?: string | null;   // ✅ 추가
  tbmSummary?: string;            // ✅ 추가
  tbmTranscript?: string;         // ✅ 추가

  // ✅ MCP: Report context for tool calling
  reportContext?: any;

  // External message injection (for corrective action button)
  externalMessage?: string | null;
  onExternalMessageSent?: () => void; // Callback to clear the external message

  // [Brief #5] Lifted narrative state - shared with AnalysisPanel via parent
  synthesisNarrative?: string | null;
  correctiveAction?: string | null;
  onSynthesisNarrativeChange?: (narrative: string | null) => void;
  onCorrectiveActionChange?: (action: string | null) => void;
}



export function ChatPanel({
  messages,
  loading,
  currentProjectName,
  currentFile,
  historicalFileName,
  issues = [],
  documentType,     // ✅
  tbmSummary = "",
  tbmTranscript = "",    // ✅
  reportContext,    // ✅ MCP
  externalMessage,
  onExternalMessageSent,
  // [Brief #5] Lifted narrative state
  synthesisNarrative: externalSynthesis,
  correctiveAction: externalCorrective,
  onSynthesisNarrativeChange,
  onCorrectiveActionChange,
}: ChatPanelProps) {


  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // [Brief #5] Capture synthesis and corrective action narratives for PDF export
  // Use external state if provided (lifted to parent), otherwise use local state
  const [localSynthesis, setLocalSynthesis] = useState<string | null>(null);
  const [localCorrective, setLocalCorrective] = useState<string | null>(null);

  const synthesisNarrative = externalSynthesis !== undefined ? externalSynthesis : localSynthesis;
  const correctiveAction = externalCorrective !== undefined ? externalCorrective : localCorrective;

  const setSynthesisNarrative = (value: string | null) => {
    if (onSynthesisNarrativeChange) {
      onSynthesisNarrativeChange(value);
    } else {
      setLocalSynthesis(value);
    }
  };

  const setCorrectiveAction = (value: string | null) => {
    if (onCorrectiveActionChange) {
      onCorrectiveActionChange(value);
    } else {
      setLocalCorrective(value);
    }
  };

  // Reset local chat and narrative captures when the document changes (messages prop changes)
  // This ensures follow-up conversation doesn't persist across document switches
  useEffect(() => {
    setChatMessages([]);
    // Only reset local state, not external (parent controls that)
    setLocalSynthesis(null);
    setLocalCorrective(null);
    // Also notify parent to reset if callbacks exist
    onSynthesisNarrativeChange?.(null);
    onCorrectiveActionChange?.(null);
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, messages]);

  // Handle external message injection (e.g., from corrective action button)
  const externalMessageRef = useRef<string | null>(null);

  useEffect(() => {
    // Only process if we have a new external message that we haven't processed yet
    if (externalMessage && externalMessage !== externalMessageRef.current && !isSending) {
      externalMessageRef.current = externalMessage;

      // Send the message
      const sendExternalMessage = async () => {
        setIsSending(true);

        // Add user message immediately
        setChatMessages((prev) => [...prev, { role: "user", text: externalMessage }]);

        // Build payload
        const payloadMessages = [...messages, ...chatMessages, { role: "user" as const, text: externalMessage }];

        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: payloadMessages.map((m) => ({ role: m.role, text: m.text })),
              reportContext: reportContext || null,
            }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

          // [Brief #5] Capture synthesis/corrective action for PDF export
          const messageType = classifyUserMessage(externalMessage);
          if (messageType === "synthesis") {
            setSynthesisNarrative(data.reply);
          }
          if (messageType === "corrective_action") {
            setCorrectiveAction(data.reply);
          }

          setChatMessages((prev) => [...prev, { role: "ai", text: data.reply }]);
        } catch (e: any) {
          toast?.error(e?.message || "채팅 실패");
          setChatMessages((prev) => [
            ...prev,
            { role: "ai", text: "오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
          ]);
        } finally {
          setIsSending(false);
          externalMessageRef.current = null;
          onExternalMessageSent?.();
        }
      };

      sendExternalMessage();
    }
  }, [externalMessage, isSending, messages, chatMessages, reportContext, onExternalMessageSent, toast]);

  const handleSend = async (directMessage?: string) => {
  const text = directMessage || input.trim();
  if (!text || isSending) return;

  setIsSending(true);
  if (!directMessage) {
    setInput("");
  }

  // 1) 사용자 메시지 즉시 표시
  setChatMessages((prev) => [...prev, { role: "user", text }]);

  // 2) 서버로 보낼 "전체 대화" 구성
  const payloadMessages = [...messages, ...chatMessages, { role: "user" as const, text }];

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: payloadMessages.map((m) => ({ role: m.role, text: m.text })),
        reportContext: reportContext || null, // ✅ MCP: Pass document context for tools
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    // [Brief #5] Capture synthesis/corrective action for PDF export
    const messageType = classifyUserMessage(text);
    if (messageType === "synthesis") {
      setSynthesisNarrative(data.reply);
    }
    if (messageType === "corrective_action") {
      setCorrectiveAction(data.reply);
    }

    // 3) AI 응답 추가
    setChatMessages((prev) => [...prev, { role: "ai", text: data.reply }]);
  } catch (e: any) {
    toast?.error(e?.message || "채팅 실패");
    setChatMessages((prev) => [
      ...prev,
      { role: "ai", text: "오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
    ]);
  } finally {
    setIsSending(false);
  }
};

  const handleExportPDF = async () => {
    if (!currentFile && !historicalFileName) {
      toast?.warning("먼저 문서를 업로드하거나 기록을 선택하세요");
      return;
    }

    if (isExportingPDF) return;

    setIsExportingPDF(true);

    // Get the first AI message as aiSummary (executive overview)
    const aiSummary = messages.find(m => m.role === "ai")?.text || "";

    const exportData = {
      fileName: currentFile?.name ?? historicalFileName ?? "report",
      projectName: currentProjectName,
      documentType: documentType ?? null,
      createdAt: new Date().toISOString(),
      issues: issues.map(i => ({
        severity: i.severity,
        title: i.title,
        message: i.message,
        ruleId: i.ruleId,
        rootCause: i.rootCause || null,
      })),
      summary: {
        totalIssues: issues.length,
        criticalCount: issues.filter(i => i.severity === "error").length,
        warningCount: issues.filter(i => i.severity === "warn").length,
        infoCount: issues.filter(i => i.severity === "info").length,
      },
      tbmSummary,
      tbmTranscript,

      // NEW fields for comprehensive report
      aiSummary: aiSummary || undefined,

      // Extracted document data from reportContext
      extractedData: reportContext ? {
        docType: reportContext.docType,
        fields: reportContext.fields,
        signature: reportContext.signature,
        inspectorName: reportContext.inspectorName,
        riskLevel: reportContext.riskLevel,
      } : undefined,

      // Checklist from reportContext
      checklist: reportContext?.checklist?.map((c: any) => ({
        id: c.id,
        category: c.category || "일반",
        nameKo: c.nameKo,
        value: c.value,
      })) || undefined,

      // Cross-validation (if photo issues exist)
      crossValidation: issues.some(i => i.ruleId?.startsWith("photo_")) ? {
        comparedWith: "최근 점검표",
        mismatches: issues.filter(i => i.ruleId?.startsWith("photo_") && i.severity === "error").length,
        warnings: issues.filter(i => i.ruleId?.startsWith("photo_") && i.severity === "warn").length,
      } : undefined,

      // [Brief #5] Narrative content for PDF restructure
      synthesisNarrative: synthesisNarrative || undefined,
      correctiveAction: correctiveAction || undefined,
    };


    try {
      console.log("[EXPORT payload]", exportData);

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
        if (filenameMatch && filenameMatch[1]) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
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

      toast?.success("PDF 리포트가 다운로드되었습니다");
    } catch (error: any) {
      toast?.error(`PDF 생성에 실패했습니다. 브라우저에서 다시 시도합니다: ${error.message || "알 수 없는 오류"}`);

      try {
        await exportReportToPDF({
          ...exportData,
          createdAt: new Date(exportData.createdAt),
        });
        toast?.success("브라우저에서 PDF를 생성했습니다");
      } catch (fallbackError: any) {
        toast?.error(`브라우저 PDF 생성도 실패했습니다: ${fallbackError.message || "알 수 없는 오류"}`);
      }
    } finally {
      setIsExportingPDF(false);
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

  const allMessages = [...messages, ...chatMessages];
  const reportExists = issues.length > 0 || messages.length > 0;

  if (allMessages.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-slate-800">
        {/* Show PDF Export header even when no messages yet, if there's content to export */}
        {reportExists && (currentFile || historicalFileName || tbmSummary) && (
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">분석 결과</h4>
            <button
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors shadow-sm ${
                isExportingPDF
                  ? "bg-slate-400 dark:bg-slate-600 text-white cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
              }`}
              title={isExportingPDF ? "PDF 생성 중..." : "PDF로 보고서 내보내기"}
            >
              {isExportingPDF ? (
                <>
                  <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                  <span className="hidden sm:inline">생성 중...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span className="hidden sm:inline">PDF 내보내기</span>
                </>
              )}
            </button>
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-center max-w-xs">
            <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-600 mb-4">
              chat_bubble
            </span>
            <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">
              분석 대기 중
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              문서를 업로드하면 AI 분석 결과가 여기 표시됩니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800">
      {/* Header with PDF Export */}
      {reportExists && (currentFile || historicalFileName || tbmSummary) && (
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">분석 결과</h4>
          <button
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors shadow-sm ${
              isExportingPDF
                ? "bg-slate-400 dark:bg-slate-600 text-white cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
            }`}
            title={isExportingPDF ? "PDF 생성 중..." : "PDF로 보고서 내보내기"}
          >
            {isExportingPDF ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">refresh</span>
                <span className="hidden sm:inline">생성 중...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">download</span>
                <span className="hidden sm:inline">PDF 내보내기</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {allMessages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl p-4 ${
                msg.role === "ai"
                  ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                  : "bg-primary text-white"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-lg">
                  {msg.role === "ai" ? "psychology" : "person"}
                </span>
                <span className={`text-xs font-bold ${msg.role === "ai" ? "text-slate-700 dark:text-slate-300" : "text-white"}`}>
                  {msg.role === "ai" ? "AI 분석" : "사용자"}
                </span>
              </div>
              {msg.role === "ai" ? (
                <div
                  className="text-sm leading-relaxed text-slate-800 dark:text-slate-200"
                  dangerouslySetInnerHTML={markdownToReactHtml(msg.text)}
                />
              ) : (
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-white">
                  {msg.text}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isSending && (
          <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="max-w-[85%] rounded-xl p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-lg text-blue-600">psychology</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">AI 분석</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                <span className="ml-2 text-xs text-slate-500">시정조치 요청서 작성 중...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="메시지를 입력하세요…"
            type="text"
            disabled={isSending}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isSending}
            className="size-10 rounded-xl bg-primary hover:bg-green-600 text-white disabled:opacity-40 disabled:hover:bg-primary transition-colors shadow-lg shadow-green-200 dark:shadow-none flex items-center justify-center shrink-0"
            aria-label="Send"
          >
            {isSending ? (
              <span className="material-symbols-outlined text-lg animate-spin">refresh</span>
            ) : (
              <span className="material-symbols-outlined text-lg">send</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
