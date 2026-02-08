
"use client";

import { useState, useMemo, useEffect, useRef } from "react";

import { useToast } from "@/contexts/ToastContext";
import { exportReportToPDF } from "@/lib/pdfExport";

// Stage detection helper
function getIssueStage(ruleId?: string): string {
    if (!ruleId) return "stage1-2";
    if (ruleId.startsWith("photo_")) return "stage-photo"; // Visual Audit Stage
    if (ruleId.startsWith("contextual_")) return "stage5-contextual"; // Contextual Safety Review
    if (ruleId.startsWith("pattern_")) return "stage4";
    if (ruleId.startsWith("cross_doc_")) return "stage3-cross";
    if (ruleId.startsWith("risk_matrix_")) return "stage3-risk";
    if (ruleId.startsWith("structured_")) return "stage3-structured";
    return "stage1-2";
}

function severityColor(sev: string, ruleId?: string) {
    const stage = getIssueStage(ruleId);
    if (stage === "stage-photo") return "text-orange-600 dark:text-orange-400"; // Visual = Distinct Color
    if (stage === "stage5-contextual") return "text-amber-600 dark:text-amber-400"; // Contextual = Amber/Gold
    if (stage === "stage3-structured") return "text-blue-600";
    if (stage === "stage3-risk") return "text-purple-600";
    if (stage === "stage3-cross") return "text-cyan-600";
    if (stage === "stage4") return "text-purple-600";
    if (sev === "error") return "text-red-600";
    if (sev === "warn") return "text-orange-600";
    return "text-slate-600";
}

function severityIcon(sev: string, ruleId?: string) {
    const stage = getIssueStage(ruleId);
    if (stage === "stage-photo") return "camera_alt"; // Camera Icon
    if (stage === "stage5-contextual") return "lightbulb"; // Lightbulb for contextual insights
    if (stage === "stage3-structured") return "verified_user";
    if (stage === "stage3-risk") return "analytics";
    if (stage === "stage3-cross") return "timeline";
    if (stage === "stage4") return "query_stats";
    if (sev === "error") return "edit_off";
    if (sev === "warn") return "warning";
    return "info";
}

function avatarBgColor(ruleId?: string) {
    const stage = getIssueStage(ruleId);
    if (stage === "stage-photo") return "bg-orange-100 dark:bg-orange-900/40";
    if (stage === "stage5-contextual") return "bg-amber-100 dark:bg-amber-900/40"; // Amber background
    if (stage === "stage3-structured") return "bg-blue-100";
    if (stage === "stage3-risk") return "bg-purple-100";
    if (stage === "stage3-cross") return "bg-cyan-100";
    if (stage === "stage4") return "bg-purple-100";
    return "bg-blue-100";
}

function avatarColor(ruleId?: string) {
    const stage = getIssueStage(ruleId);
    if (stage === "stage5-contextual") return "text-amber-600 dark:text-amber-400"; // Amber icon
    if (stage === "stage3-structured") return "text-blue-600";
    if (stage === "stage3-risk") return "text-purple-600";
    if (stage === "stage3-cross") return "text-cyan-600";
    if (stage === "stage4") return "text-purple-600";
    return "text-blue-600";
}

interface Issue {
    id: string;
    severity: "error" | "warn" | "info";
    title: string;
    message: string;
    ruleId?: string; // Stage 2-5: Link to specific rule
    confidence?: number; // Stage 4
    score?: number; // Stage 4
    isAIFixable?: boolean; // Whether AI can suggest a fix (false for photos, signatures)
    rootCause?: {  // Research-backed root cause classification
        id: string;
        nameKo: string;
        nameEn: string;
    } | null;
}

interface RiskFactor {
    category: string;
    description: string;
    impact: number;
    severity: "low" | "medium" | "high" | "critical";
}

interface RiskCalculation {
    calculatedRisk: "low" | "medium" | "high" | "critical";
    documentedRisk: "low" | "medium" | "high" | "critical" | null;
    riskScore: number;
    factors: RiskFactor[];
    inconsistency: boolean;
    recommendation?: string;
}

interface ValidationStage {
    id: string;
    label: string;
    icon: string;
}

interface FallHazardStatus {
    detected: boolean;
    confidence: "high" | "medium" | "low";
    indicators: string[];
    source: string;
}

interface AnalysisPanelProps {
    loading: boolean;
    issues: Issue[];
    chatMessages: { role: "ai" | "user"; text: string }[];
    onReupload: () => void;
    onModify: () => void;
    currentProjectName?: string;
    riskCalculation?: RiskCalculation; // Stage 3: Risk matrix data
    historicalFileName?: string;
    currentFile?: File | null;
    tbmSummary?: string;
    tbmTranscript?: string;
    documentType?: string | null;
    validationStep?: number;
    showProgress?: boolean;
    validationSteps?: ValidationStage[]; // Dynamic stages
    initialHiddenIssueIds?: string[]; // Persist hidden issues across restarts
    onHiddenIssuesChange?: (hiddenIds: string[]) => void; // Callback when hidden issues change
    hasUnviewedIssues?: boolean; // Show indicator when analysis completes with issues
    isAnimating?: boolean; // Brief pulse animation when issues arrive
    onMarkIssuesViewed?: () => void; // Callback when user views issues
    initialLocalChatMessages?: { role: "ai" | "user"; text: string }[]; // Persist local chat history
    onLocalChatMessagesChange?: (messages: { role: "ai" | "user"; text: string }[]) => void; // Callback when chat messages change
    reportContext?: any; // Enriched context for chat (extractedData, projectContext, etc.)
    onSendChatMessage?: (message: string) => void; // Inject message into chat (for corrective action)
    fallHazardStatus?: FallHazardStatus | null; // [Brief #2] Fall hazard detection status
}

export default function AnalysisPanel({ loading, issues, chatMessages, onReupload, onModify, currentProjectName, riskCalculation, currentFile, historicalFileName, tbmSummary, tbmTranscript, documentType, validationStep = 0, showProgress = false, validationSteps, initialHiddenIssueIds = [], onHiddenIssuesChange, hasUnviewedIssues = false, isAnimating = false, onMarkIssuesViewed, initialLocalChatMessages = [], onLocalChatMessagesChange, reportContext, onSendChatMessage, fallHazardStatus }: AnalysisPanelProps) {
    // Default to 5-stage document validation if not provided
    const defaultSteps: ValidationStage[] = [
        { id: "stage1", label: "형식 검증", icon: "description" },
        { id: "stage2", label: "논리 검증", icon: "rule" },
        { id: "stage3", label: "교차 분석", icon: "compare_arrows" },
        { id: "stage4", label: "패턴 감지", icon: "analytics" },
        { id: "stage5", label: "위험 평가", icon: "shield" },
    ];
    const steps = validationSteps || defaultSteps;
    const totalSteps = steps.length;
    const [hiddenIssueIds, setHiddenIssueIds] = useState<Set<string>>(new Set(initialHiddenIssueIds));
    const [processingIssueId, setProcessingIssueId] = useState<string | null>(null);
    const toast = useToast();
    const [showRiskDetails, setShowRiskDetails] = useState(false);
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

    // Chat state
    const [chatInput, setChatInput] = useState("");
    const [isSendingChat, setIsSendingChat] = useState(false);
    const [localChatMessages, setLocalChatMessages] = useState<{ role: "ai" | "user"; text: string }[]>(initialLocalChatMessages);

    // Sync localChatMessages when initialLocalChatMessages changes (e.g., project switch, async restore)
    useEffect(() => {
        setLocalChatMessages(initialLocalChatMessages);
    }, [initialLocalChatMessages]);

    // Smart severity filter: Only show buttons for severities that exist in issues
    const availableSeverities = useMemo(() => {
        const severities = new Set<string>();
        issues.forEach(issue => severities.add(issue.severity));
        return severities;
    }, [issues]);

    // Initialize filters to only include available severities
    const [severityFilters, setSeverityFilters] = useState<Set<string>>(new Set(["error", "warn", "info"]));

    // Suggestion Modal State
    const [suggestion, setSuggestion] = useState<{ title: string; text: string } | null>(null);

    // Notify parent when hidden issues change (for persistence)
    useEffect(() => {
        if (onHiddenIssuesChange) {
            onHiddenIssuesChange(Array.from(hiddenIssueIds));
        }
    }, [hiddenIssueIds, onHiddenIssuesChange]);

    // Notify parent when local chat messages change (for persistence)
    useEffect(() => {
        if (onLocalChatMessagesChange) {
            onLocalChatMessagesChange(localChatMessages);
        }
    }, [localChatMessages, onLocalChatMessagesChange]);

    // Ref for issues section - used for auto-scroll
    const issuesSectionRef = useRef<HTMLDivElement>(null);
    // Ref for chat end - used for scroll to chat
    const chatEndRef = useRef<HTMLDivElement>(null);



    // Chat functionality - can accept direct message or use chatInput state
    const handleSendChat = async (directMessage?: string) => {
        const text = directMessage || chatInput.trim();
        if (!text || isSendingChat) return;

        setIsSendingChat(true);
        if (!directMessage) {
            setChatInput("");
        }

        // Add user message immediately
        setLocalChatMessages((prev) => [...prev, { role: "user", text }]);

        // Use enriched reportContext from props, or build minimal fallback
        const chatReportContext = reportContext || {
            issues: issues.map(i => ({
                severity: i.severity,
                title: i.title,
                message: i.message,
                ruleId: i.ruleId,
                rootCause: i.rootCause || null,
            })),
        };

        try {
            const allMessages = [...chatMessages, ...localChatMessages, { role: "user" as const, text }];
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: allMessages.map((m) => ({ role: m.role, text: m.text })),
                    reportContext: chatReportContext,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

            // Add AI response
            setLocalChatMessages((prev) => [...prev, { role: "ai", text: data.reply }]);
        } catch (e: any) {
            toast.error(e?.message || "채팅 실패");
            setLocalChatMessages((prev) => [
                ...prev,
                { role: "ai", text: "오류가 발생했어요. 잠시 후 다시 시도해 주세요." },
            ]);
        } finally {
            setIsSendingChat(false);
        }
    };

    const reportExists = issues.length > 0 || chatMessages.length > 0;
    const allChatMessages = [...chatMessages, ...localChatMessages];
    const statusLabel = loading ? "분석 중..." : reportExists ? "분석 완료" : "대기 중";
    const exportButtonClassName = `flex items-center gap-2 px-4 py-2 font-bold rounded-lg transition-colors shadow-lg ${isExportingPDF
        ? "bg-slate-400 dark:bg-slate-600 text-white cursor-not-allowed"
        : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
        }`;

    // Filter hidden issues and by severity
    const visibleIssues = issues.filter(i =>
        !hiddenIssueIds.has(i.id) && severityFilters.has(i.severity)
    );

    // Auto-scroll to issues when analysis completes with new issues
    useEffect(() => {
        console.log(`[Auto-scroll] hasUnviewedIssues: ${hasUnviewedIssues}, visibleIssues.length: ${visibleIssues.length}, issuesSectionRef.current: ${!!issuesSectionRef.current}`);

        if (hasUnviewedIssues && visibleIssues.length > 0 && issuesSectionRef.current) {
            console.log('[Auto-scroll] Triggering scroll in 800ms...');
            // Delay to ensure DOM is ready and progress modal is closed
            const timeoutId = setTimeout(() => {
                console.log('[Auto-scroll] Executing scrollIntoView');
                try {
                    issuesSectionRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });
                    console.log('[Auto-scroll] Scroll executed successfully');
                } catch (error) {
                    console.error('[Auto-scroll] Error during scroll:', error);
                }
                // Mark as viewed after scrolling
                onMarkIssuesViewed?.();
                console.log('[Auto-scroll] Marked as viewed');
            }, 800);

            return () => clearTimeout(timeoutId);
        }
    }, [hasUnviewedIssues, visibleIssues.length]);

    const toggleSeverityFilter = (severity: string) => {
        setSeverityFilters(prev => {
            const next = new Set(prev);
            if (next.has(severity)) {
                next.delete(severity);
            } else {
                next.add(severity);
            }
            return next;
        });
    };

    // Count issues by severity
    const errorCount = issues.filter(i => i.severity === "error").length;
    const warnCount = issues.filter(i => i.severity === "warn").length;
    const infoCount = issues.filter(i => i.severity === "info").length;

    const handleConfirm = (id: string) => {
        setHiddenIssueIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    };

    const handleFix = async (issue: Issue) => {
        setProcessingIssueId(issue.id);
        try {
            let pdfText = "";
            let fileData = null;
            let fileType = "";

            if (currentFile) {
                fileType = currentFile.type;
                if (fileType === "application/pdf") {
                    fileData = await currentFile.arrayBuffer();
                    // We need to send base64 or similar if we want to process it server side in this simple setup
                    // For now let's just ask for text suggestion to keep it light unless we implement full upload
                }
            }

            const res = await fetch("/api/fix", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    issue,
                    fileType: "image/png", // forcing text suggestion for now to avoid massive payload issues
                    pdfText: ""
                })
            });

            const data = await res.json();
            if (data.error) {
                alert(`AI 수정 제안 실패: ${data.error}`);
                return;
            }

            if (data.suggestion) {
                setSuggestion({ title: "AI 추천 수정안", text: data.suggestion });
            }
        } catch (e: any) {
            console.error(e);
            alert("AI 수정 제안 시스템 오류");
        } finally {
            setProcessingIssueId(null);
        }
    };

    // Request corrective action - injects a pre-built message into chat
    const requestCorrectiveAction = (issue: Issue) => {
        const severityKo = issue.severity === "error" ? "심각" : issue.severity === "warn" ? "경고" : "정보";

        const userMessage = `이 문제에 대한 시정조치 요청서를 작성해주세요:

제목: ${issue.title}
심각도: ${severityKo}
상세: ${issue.message}${issue.ruleId ? `
규칙: ${issue.ruleId}` : ""}`;

        // Send directly using the message parameter
        handleSendChat(userMessage);

        // Scroll to chat area after a brief delay to show the typing indicator
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
        }, 100);
    };

    const handleExportPDF = async () => {
        // ✅ Allow export if there's a file, historical record, OR TBM data
        if (!currentFile && !historicalFileName && !tbmSummary) {
            toast.warning("내보낼 보고서가 없습니다. 문서를 업로드하거나 TBM을 기록하세요.");
            return;
        }

        // Prevent double-clicks while generating
        if (isExportingPDF) {
            return;
        }

        setIsExportingPDF(true);

        // DIAGNOSTIC: Log state before export
        console.log('[AnalysisPanel] Export PDF clicked');
        console.log('[AnalysisPanel] Current file:', currentFile?.name ?? historicalFileName);
        console.log('[AnalysisPanel] Issues count:', issues.length);
        console.log('[AnalysisPanel] Project name:', currentProjectName);
        console.log('[AnalysisPanel] Document type:', documentType);
        console.log('[AnalysisPanel] TBM Summary length:', (tbmSummary || "").length);
        console.log('[AnalysisPanel] TBM Summary content:', tbmSummary ? tbmSummary.substring(0, 100) + "..." : "(empty)");
        console.log('[AnalysisPanel] TBM Transcript length:', (tbmTranscript || "").length);

        // Get the first AI message as aiSummary (executive overview)
        const aiSummary = chatMessages.find(m => m.role === "ai")?.text || "";

        const exportData = {
            fileName: currentFile?.name ?? historicalFileName ?? (tbmSummary ? "TBM(작업 전 대화)" : "report"),
            projectName: currentProjectName,
            documentType: documentType || (tbmSummary ? "TBM" : null),
            createdAt: new Date().toISOString(), // Convert to ISO string for JSON
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
            tbmSummary: tbmSummary || "",
            tbmTranscript: tbmTranscript || "",

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

            // Risk score (if available)
            riskScore: riskCalculation ? {
                score: riskCalculation.riskScore,
                level: riskCalculation.calculatedRisk,
                factors: riskCalculation.factors?.map(f => ({
                    name: f.category,
                    points: f.impact,
                    description: f.description,
                })),
            } : undefined,

            // Cross-validation (if photo issues exist)
            crossValidation: issues.some(i => i.ruleId?.startsWith("photo_")) ? {
                comparedWith: "최근 점검표",
                mismatches: issues.filter(i => i.ruleId?.startsWith("photo_") && i.severity === "error").length,
                warnings: issues.filter(i => i.ruleId?.startsWith("photo_") && i.severity === "warn").length,
            } : undefined,
        };

        try {
            console.log('[AnalysisPanel] Severity breakdown:', {
                critical: exportData.summary.criticalCount,
                warning: exportData.summary.warningCount,
                info: exportData.summary.infoCount,
                total: exportData.summary.totalIssues
            });

            console.log('[AnalysisPanel] Prepared export data:', exportData);
            console.log('[AnalysisPanel] Calling backend API...');
            console.log("[EXPORT payload]", exportData);

            // Call backend API for PDF generation
            const response = await fetch('/api/export-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exportData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            console.log('[AnalysisPanel] PDF generated, downloading...');

            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'report.pdf';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = decodeURIComponent(filenameMatch[1]);
                }
            }

            // Download the PDF
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log('[AnalysisPanel] PDF export completed successfully');
            toast.success("PDF 리포트가 다운로드되었습니다");
        } catch (error: any) {
            console.error('[AnalysisPanel] PDF export failed:', error);
            console.error('[AnalysisPanel] Error message:', error.message);
            toast.error(`PDF 생성에 실패했습니다. 브라우저에서 다시 시도합니다: ${error.message || '알 수 없는 오류'}`);

            try {
                await exportReportToPDF({
                    ...exportData,
                    createdAt: new Date(exportData.createdAt),
                });
                toast.success("브라우저에서 PDF를 생성했습니다");
            } catch (fallbackError: any) {
                console.error('[AnalysisPanel] Client-side PDF export failed:', fallbackError);
                toast.error(`브라우저 PDF 생성도 실패했습니다: ${fallbackError.message || '알 수 없는 오류'}`);
            }
        } finally {
            setIsExportingPDF(false);
        }
    };

    // Group visible issues by stage
    const stage12Issues = visibleIssues.filter(i => getIssueStage(i.ruleId) === "stage1-2");
    const stage3StructuredIssues = visibleIssues.filter(i => getIssueStage(i.ruleId) === "stage3-structured");
    const stage3RiskIssues = visibleIssues.filter(i => getIssueStage(i.ruleId) === "stage3-risk");
    const stage3CrossIssues = visibleIssues.filter(i => getIssueStage(i.ruleId) === "stage3-cross");
    const stage4Issues = visibleIssues.filter(i => getIssueStage(i.ruleId) === "stage4");
    const stage5ContextualIssues = visibleIssues.filter(i => getIssueStage(i.ruleId) === "stage5-contextual");

    // ... (Keep existing helpers and render logic, but pass handle functions to IssueCard)

    // Default welcome message if no chat
    const messages = chatMessages.length > 0 ? chatMessages : [
        { role: "ai", text: "안녕하세요! 👋\n서류를 올려주시면 빠진 항목/불일치/수정사항을 찾아드릴게요." }
    ];

    // Risk level Korean translation
    const riskLevelKo: Record<string, string> = {
        low: "낮음",
        medium: "보통",
        high: "높음",
        critical: "매우 높음"
    };

    // Risk level colors
    const riskLevelColor: Record<string, string> = {
        low: "bg-green-100 text-green-700 border-green-300",
        medium: "bg-yellow-100 text-yellow-700 border-yellow-300",
        high: "bg-orange-100 text-orange-700 border-orange-300",
        critical: "bg-red-100 text-red-700 border-red-300"
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 shadow-2xl relative">
            <div className="shrink-0 bg-white dark:bg-surface-dark p-6 border-b border-slate-100 dark:border-slate-700 shadow-sm relative z-10">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className="size-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0 border-2 border-blue-200">
                            <span className="material-symbols-outlined text-blue-600 dark:text-blue-300 text-4xl">
                                smart_toy
                            </span>
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-green-500 size-5 rounded-full border-2 border-white" />
                    </div>

                    <div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">
                            AI 안전도우미
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20" suppressHydrationWarning>
                                {statusLabel}
                            </span>
                            {currentProjectName && (
                                <span className="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-sm font-bold text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10 border border-blue-200 dark:border-blue-800">
                                    <span className="material-symbols-outlined text-[16px] mr-1">business</span>
                                    {currentProjectName}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* PDF Export Button */}
                    {reportExists && (currentFile || historicalFileName || tbmSummary) && (
                        <button
                            onClick={handleExportPDF}
                            disabled={isExportingPDF}
                            className={exportButtonClassName}
                            title={isExportingPDF ? "PDF 생성 중..." : "PDF로 보고서 내보내기"}
                        >
                            {isExportingPDF ? (
                                <>
                                    <span className="material-symbols-outlined text-lg animate-spin">refresh</span>
                                    <span className="hidden sm:inline">생성 중...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-lg">download</span>
                                    <span className="hidden sm:inline">PDF 내보내기</span>
                                </>
                            )}
                        </button>
                    )}
                </div>

                {tbmSummary && (
                    <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                            <span className="material-symbols-outlined text-base">summarize</span>
                            TBM 요약
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                            {tbmSummary}
                        </div>
                    </div>
                )}

                {/* Severity Filter - Only show when there are issues and only show buttons for available severities */}
                {reportExists && issues.length > 0 && availableSeverities.size > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 pb-4 border-b border-slate-200 dark:border-slate-700">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">필터:</span>
                        {availableSeverities.has("error") && (
                            <button
                                onClick={() => toggleSeverityFilter("error")}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${severityFilters.has("error")
                                    ? "bg-red-100 text-red-700 border-2 border-red-300 dark:bg-red-900/30 dark:text-red-300"
                                    : "bg-slate-100 text-slate-400 border-2 border-slate-200 dark:bg-slate-700 dark:text-slate-500"
                                    }`}
                            >
                                <span className="material-symbols-outlined text-sm">error</span>
                                <span>심각 ({errorCount})</span>
                            </button>
                        )}
                        {availableSeverities.has("warn") && (
                            <button
                                onClick={() => toggleSeverityFilter("warn")}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${severityFilters.has("warn")
                                    ? "bg-orange-100 text-orange-700 border-2 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300"
                                    : "bg-slate-100 text-slate-400 border-2 border-slate-200 dark:bg-slate-700 dark:text-slate-500"
                                    }`}
                            >
                                <span className="material-symbols-outlined text-sm">warning</span>
                                <span>경고 ({warnCount})</span>
                            </button>
                        )}
                        {availableSeverities.has("info") && (
                            <button
                                onClick={() => toggleSeverityFilter("info")}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${severityFilters.has("info")
                                    ? "bg-blue-100 text-blue-700 border-2 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300"
                                    : "bg-slate-100 text-slate-400 border-2 border-slate-200 dark:bg-slate-700 dark:text-slate-500"
                                    }`}
                            >
                                <span className="material-symbols-outlined text-sm">info</span>
                                <span>정보 ({infoCount})</span>
                            </button>
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                            {visibleIssues.length} / {issues.length} 표시중
                        </span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-slate-50 dark:bg-[#1a2233]">
                <div className="flex justify-center">
                    <span className="text-xs font-medium text-slate-400 bg-slate-200/50 px-3 py-1 rounded-full">오늘</span>
                </div>

                {/* Loading State & Verification Progress */}
                {(loading || showProgress) && (
                    <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-blue-500 animate-spin">sync</span>
                                AI 정밀 분석 중...
                            </h3>
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                                {Math.round((validationStep / totalSteps) * 100)}%
                            </span>
                        </div>

                        {/* Progress Steps */}
                        <div className="relative">
                            <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-slate-100 dark:bg-slate-700" />
                            <div className="space-y-4 relative">
                                {steps.map((s, idx) => {
                                    const stepNumber = idx + 1;
                                    const isCompleted = validationStep > stepNumber;
                                    const isCurrent = Math.floor(validationStep) === stepNumber;
                                    const isPending = validationStep < stepNumber;

                                    return (
                                        <div key={s.id} className="flex items-center gap-3">
                                            <div className={`relative z-10 flex items-center justify-center size-5 rounded-full border-2 transition-colors ${isCompleted ? "bg-green-500 border-green-500" :
                                                isCurrent ? "bg-white border-blue-500" :
                                                    "bg-white border-slate-200 dark:border-slate-600 dark:bg-slate-800"
                                                }`}>
                                                {isCompleted && <span className="material-symbols-outlined text-white text-[10px] font-bold">check</span>}
                                                {isCurrent && <div className="size-2 bg-blue-500 rounded-full animate-pulse" />}
                                            </div>
                                            <span className={`text-sm font-medium transition-colors ${isCompleted ? "text-slate-500 dark:text-slate-400" :
                                                isCurrent ? "text-blue-600 dark:text-blue-400 font-bold" :
                                                    "text-slate-300 dark:text-slate-600"
                                                }`}>
                                                {s.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Skeleton Loader (only if loading and no progress shown yet) */}
                {loading && !showProgress && (
                    <div className="space-y-3 animate-pulse">
                        <div className="flex gap-3">
                            <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                                <div className="h-24 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700" />
                            </div>
                        </div>
                    </div>
                )}

                {/* Chat Messages */}
                {allChatMessages.map((msg, idx) => (
                    <div key={idx} className="chat-message flex gap-3">
                        <div className={`size-10 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1 ${msg.role === "user" ? "bg-primary/20" : "bg-blue-100"}`}>
                            <span className={`material-symbols-outlined text-xl ${msg.role === "user" ? "text-primary" : "text-blue-600"}`}>
                                {msg.role === "user" ? "person" : "smart_toy"}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1 max-w-[85%]">
                            <span className="text-xs font-bold text-slate-500 ml-1">
                                {msg.role === "user" ? "나" : "AI 안전도우미"}
                            </span>
                            <div className={`p-4 rounded-2xl shadow-sm border text-slate-800 dark:text-white whitespace-pre-line ${
                                msg.role === "user"
                                    ? "bg-primary/10 dark:bg-primary/20 rounded-tr-none border-primary/20 dark:border-primary/30"
                                    : "bg-white dark:bg-surface-dark rounded-tl-none border-slate-100 dark:border-slate-700"
                            }`}>
                                {msg.text}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Typing Indicator - shown while AI is generating response */}
                {isSendingChat && (
                    <div className="chat-message flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 shadow-sm mt-1">
                            <span className="material-symbols-outlined text-blue-600 text-xl">smart_toy</span>
                        </div>
                        <div className="flex flex-col gap-1 max-w-[85%]">
                            <span className="text-xs font-bold text-slate-500 ml-1">AI 안전도우미</span>
                            <div className="bg-white dark:bg-surface-dark p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-1">
                                    <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                                    <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                                    <span className="size-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scroll anchor for chat */}
                <div ref={chatEndRef} />

                {/* Risk Dashboard */}
                {riskCalculation && (
                    <div className="chat-message flex gap-3">
                        <div className="size-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0 shadow-sm mt-1">
                            <span className="material-symbols-outlined text-purple-600 text-xl">analytics</span>
                        </div>
                        <div className="flex flex-col gap-1 w-full max-w-[85%]">
                            <span className="text-xs font-bold text-slate-500 ml-1">위험도 평가 시스템</span>
                            <div className="bg-white dark:bg-surface-dark p-5 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-700">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-600 mb-1">객관적 위험도 점수</h3>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-3xl font-black text-slate-800 dark:text-white">{riskCalculation.riskScore}</span>
                                            <span className="text-sm text-slate-500">/100</span>
                                        </div>
                                    </div>
                                    <div className={`px-4 py-2 rounded-full border-2 font-bold text-sm ${riskLevelColor[riskCalculation.calculatedRisk]}`}>
                                        {riskLevelKo[riskCalculation.calculatedRisk]}
                                    </div>
                                </div>

                                {/* Risk Factors */}
                                <button
                                    onClick={() => setShowRiskDetails(!showRiskDetails)}
                                    className="w-full flex items-center justify-between text-sm font-bold text-slate-600 hover:text-slate-800 py-2 border-t border-slate-200"
                                >
                                    <span>위험 요인 상세 ({riskCalculation.factors.length}개)</span>
                                    <span className="material-symbols-outlined text-lg">
                                        {showRiskDetails ? "expand_less" : "expand_more"}
                                    </span>
                                </button>

                                {showRiskDetails && (
                                    <div className="mt-3 space-y-2">
                                        {riskCalculation.factors.map((factor, idx) => (
                                            <div key={idx} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                                                <div className={`mt-1 size-2 rounded-full ${factor.severity === "critical" ? "bg-red-500" :
                                                    factor.severity === "high" ? "bg-orange-500" :
                                                        factor.severity === "medium" ? "bg-yellow-500" : "bg-green-500"
                                                    }`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-sm font-medium text-slate-700">{factor.description}</p>
                                                        <span className="text-xs font-bold text-slate-500 ml-2">+{factor.impact}점</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* [Brief #2] Fall Hazard Warning Banner */}
                {fallHazardStatus?.detected && (
                    <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-4 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
                        <div className="flex items-start">
                            <span className="material-symbols-outlined text-red-500 text-2xl mr-3 mt-0.5">warning</span>
                            <div className="flex-1">
                                <h4 className="text-red-800 dark:text-red-200 font-bold text-sm flex items-center gap-2">
                                    ⚠️ 추락 위험 우선 경고
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        fallHazardStatus.confidence === "high"
                                            ? "bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200"
                                            : "bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200"
                                    }`}>
                                        신뢰도: {fallHazardStatus.confidence === "high" ? "높음" : fallHazardStatus.confidence === "medium" ? "중간" : "낮음"}
                                    </span>
                                </h4>
                                <p className="text-red-700 dark:text-red-300 text-xs mt-1 leading-relaxed">
                                    고소작업이 감지되었습니다. <strong>추락사고는 건설업 사망사고의 71%</strong>를 차지합니다.
                                    <br />추락 관련 모든 항목이 최우선으로 검증됩니다.
                                </p>
                                {fallHazardStatus.indicators && fallHazardStatus.indicators.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {fallHazardStatus.indicators.slice(0, 5).map((indicator, idx) => (
                                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300">
                                                {indicator}
                                            </span>
                                        ))}
                                        {fallHazardStatus.indicators.length > 5 && (
                                            <span className="text-xs text-red-500">+{fallHazardStatus.indicators.length - 5}개 더</span>
                                        )}
                                    </div>
                                )}
                                <p className="text-xs text-red-500 dark:text-red-400 mt-2 italic">
                                    출처: Hwang et al. (2023) - 소규모 건설현장 사망사고 분석 연구
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Render Issues by Stage - Card List View */}
                <div
                    ref={issuesSectionRef}
                    className={`transition-all duration-500 rounded-xl ${isAnimating ? "ring-4 ring-blue-500 shadow-lg shadow-blue-500/50 bg-blue-50 dark:bg-blue-900/30" : ""}`}
                >
                    {/* Issues Header */}
                    {visibleIssues.length > 0 && (
                        <div className={`px-4 py-3 mb-3 rounded-xl transition-all duration-500 ${isAnimating ? "bg-blue-200 dark:bg-blue-800/50 border-2 border-blue-400" : "bg-slate-100 dark:bg-slate-800"}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-slate-800 dark:text-white">발견된 문제</h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white ${
                                        issues.filter(i => i.severity === "error").length > 0 ? "bg-red-500" :
                                        issues.filter(i => i.severity === "warn").length > 0 ? "bg-orange-500" : "bg-blue-500"
                                    } ${isAnimating ? "animate-bounce" : ""}`}>
                                        {visibleIssues.length}
                                    </span>
                                    {hasUnviewedIssues && (
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {issues.filter(i => i.severity === "error").length > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                                            <span className="material-symbols-outlined text-sm">error</span>
                                            {issues.filter(i => i.severity === "error").length}
                                        </span>
                                    )}
                                    {issues.filter(i => i.severity === "warn").length > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                                            <span className="material-symbols-outlined text-sm">warning</span>
                                            {issues.filter(i => i.severity === "warn").length}
                                        </span>
                                    )}
                                    {issues.filter(i => i.severity === "info").length > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                                            <span className="material-symbols-outlined text-sm">info</span>
                                            {issues.filter(i => i.severity === "info").length}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {[
                        { title: "📸 시각적 증거 분석 (Photo Audit)", issues: visibleIssues.filter(i => getIssueStage(i.ruleId) === "stage-photo"), color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800" },
                        { title: "Stage 1-2: 형식 및 논리 검증", issues: stage12Issues, color: "text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" },
                        { title: "Stage 3: 구조화된 계획 검증", issues: stage3StructuredIssues, color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
                        { title: "Stage 3: 위험도 분석", issues: stage3RiskIssues, color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" },
                        { title: "Stage 3: 문서 간 분석", issues: stage3CrossIssues, color: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800" },
                        { title: "Stage 4: 행동 패턴 분석", issues: stage4Issues, color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" },
                        { title: "Stage 5: 상황별 안전 분석", issues: stage5ContextualIssues, color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
                    ].map((group, idx) => (
                        group.issues.length > 0 && (
                            <div key={idx} className="space-y-3">
                                <div className="flex justify-center mb-3">
                                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${group.color}`}>
                                        {group.title}
                                    </span>
                                </div>

                                {/* Card List - Mobile-Friendly */}
                                <div className="space-y-2 px-2">
                                    {group.issues.map((issue) => (
                                        <button
                                            key={issue.id}
                                            onClick={() => {
                                                setSelectedIssue(issue);
                                                onMarkIssuesViewed?.();
                                            }}
                                            className="w-full text-left"
                                        >
                                            <div className={`p-3 rounded-xl border-2 transition-all hover:shadow-md ${
                                                isAnimating ? "ring-2 ring-blue-500 ring-offset-1 shadow-lg shadow-blue-500/30" : ""
                                                } ${issue.severity === "error"
                                                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700"
                                                    : issue.severity === "warn"
                                                        ? "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 hover:border-orange-300 dark:hover:border-orange-700"
                                                        : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700"
                                                }`}>
                                                <div className="flex items-start gap-3">
                                                    {/* Icon */}
                                                    <div className={`size-10 rounded-full flex items-center justify-center flex-shrink-0 ${avatarBgColor(issue.ruleId)}`}>
                                                        <span className={`material-symbols-outlined text-xl ${avatarColor(issue.ruleId)}`}>
                                                            {severityIcon(issue.severity, issue.ruleId)}
                                                        </span>
                                                    </div>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <h4 className={`font-bold text-sm ${severityColor(issue.severity, issue.ruleId)}`}>
                                                                {issue.title}
                                                            </h4>
                                                            {issue.rootCause && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                                                                    {issue.rootCause.nameKo}
                                                                </span>
                                                            )}
                                                            {issue.confidence !== undefined && (
                                                                <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                                                    {issue.confidence}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                                            {issue.message}
                                                        </p>
                                                        <div className="mt-2 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                                            <span className="material-symbols-outlined text-sm">touch_app</span>
                                                            <span>탭하여 자세히 보기</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}
                </div>

                <div className="h-4" />
            </div>

            {/* Suggestion Modal */}
            {suggestion && (
                <div
                    className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-10"
                    onClick={() => setSuggestion(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 className="text-xl font-bold mb-4 dark:text-white">{suggestion.title}</h3>
                        <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-xl font-mono text-sm overflow-auto max-h-[300px] mb-4 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                            {suggestion.text}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => navigator.clipboard.writeText(suggestion.text)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-800 font-bold"
                            >
                                복사하기
                            </button>
                            <button
                                onClick={() => setSuggestion(null)}
                                className="px-4 py-2 bg-primary text-white rounded-lg font-bold"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedIssue && (
                <div
                    className="absolute inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-10"
                    onClick={() => setSelectedIssue(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-xl border border-slate-200 dark:border-slate-700"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`size-12 rounded-full flex items-center justify-center ${avatarBgColor(selectedIssue.ruleId)}`}>
                                    <span className={`material-symbols-outlined text-2xl ${avatarColor(selectedIssue.ruleId)}`}>
                                        {severityIcon(selectedIssue.severity, selectedIssue.ruleId)}
                                    </span>
                                </div>
                                <div>
                                    <h3 className={`text-lg font-black ${severityColor(selectedIssue.severity, selectedIssue.ruleId)}`}>
                                        {selectedIssue.title}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        {selectedIssue.rootCause && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700" title={`연구 기반 근본 원인: ${selectedIssue.rootCause.nameEn}`}>
                                                {selectedIssue.rootCause.nameKo}
                                            </span>
                                        )}
                                        {selectedIssue.confidence !== undefined && (
                                            <span className="text-xs text-slate-400">
                                                신뢰도 {selectedIssue.confidence}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedIssue(null)}
                                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                                aria-label="문제 상세 닫기"
                                title="닫기"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line mb-6">
                            {selectedIssue.message}
                        </p>

                        <div className={`grid gap-2 ${selectedIssue.isAIFixable === false ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            <button
                                onClick={() => {
                                    handleConfirm(selectedIssue.id);
                                    setSelectedIssue(null);
                                }}
                                className="py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-bold shadow-sm flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">visibility_off</span>
                                무시
                            </button>

                            {selectedIssue.isAIFixable !== false && (
                                <button
                                    onClick={() => {
                                        requestCorrectiveAction(selectedIssue);
                                        setSelectedIssue(null);
                                    }}
                                    className="py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-sm shadow-amber-200 flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">assignment_late</span>
                                    시정조치
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Input - Always visible at bottom */}
            <div className="p-4 bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                    <input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSendChat();
                            }
                        }}
                        placeholder="AI 안전도우미에게 질문하기..."
                        disabled={isSendingChat}
                        className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                    />
                    <button
                        onClick={() => handleSendChat()}
                        disabled={!chatInput.trim() || isSendingChat}
                        className="size-10 rounded-xl bg-primary hover:bg-green-600 text-white disabled:opacity-40 disabled:hover:bg-primary transition-colors shadow-lg shadow-green-200 dark:shadow-none flex items-center justify-center shrink-0"
                        aria-label="Send"
                    >
                        {isSendingChat ? (
                            <span className="material-symbols-outlined text-lg animate-spin">refresh</span>
                        ) : (
                            <span className="material-symbols-outlined text-lg">send</span>
                        )}
                    </button>
                </div>
            </div>
        </div >
    );
};
