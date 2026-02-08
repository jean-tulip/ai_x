import { logger } from "@/lib/logger";

interface ExportData {
    // Existing fields (keep all)
    fileName: string;
    projectName?: string;
    documentType?: string | null;
    createdAt: Date;
    tbmSummary?: string;
    tbmTranscript?: string;
    issues: Array<{
        severity: string;
        title: string;
        message: string;
        ruleId?: string;
        rootCause?: {
            id: string;
            nameKo: string;
            nameEn: string;
        } | null;
    }>;
    summary: {
        totalIssues: number;
        criticalCount: number;
        warningCount: number;
        infoCount: number;
    };

    // NEW fields for comprehensive report
    aiSummary?: string;  // First chat message from AI (document summary)

    extractedData?: {
        docType?: string;
        fields?: {
            점검일자?: string | null;
            현장명?: string | null;
            작업내용?: string | null;
            작업인원?: string | null;
        };
        signature?: {
            담당?: string;  // "present" | "missing" | "unknown"
            소장?: string;
        };
        inspectorName?: string | null;
        riskLevel?: string | null;  // "high" | "medium" | "low" | null
    };

    checklist?: Array<{
        id: string;
        category: string;
        nameKo: string;
        value: string;  // "✔" | "✖" | "N/A" | null
    }>;

    riskScore?: {
        score: number;       // 0-100
        level: string;       // "high" | "medium" | "low"
        factors?: Array<{
            name: string;
            points: number;
            description: string;
        }>;
    };

    crossValidation?: {
        comparedWith?: string;
        mismatches?: number;
        warnings?: number;
    };
}

function getSeverityKorean(severity: string): string {
    const map: Record<string, string> = {
        error: "심각",
        warn: "경고",
        info: "정보",
    };
    return map[severity] || severity;
}

function getSeverityColor(severity: string): string {
    const map: Record<string, string> = {
        error: "#ef4444",
        warn: "#f97316",
        info: "#3b82f6",
    };
    return map[severity] || "#64748b";
}

function getSeverityBgColor(severity: string): string {
    const map: Record<string, string> = {
        error: "#fee2e2",
        warn: "#ffedd5",
        info: "#dbeafe",
    };
    return map[severity] || "#f1f5f9";
}

function escapeHtml(unsafe: string | undefined | null): string {
    if (!unsafe) return "";
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export async function exportReportToPDF(data: ExportData) {
    // DIAGNOSTIC CHECK 1: Log data being passed
    console.log('[PDF Export] Starting PDF generation with data:', {
        fileName: data.fileName,
        projectName: data.projectName,
        issuesCount: data.issues.length,
        totalIssues: data.summary.totalIssues,
        hasIssues: data.issues.length > 0,
        criticalCount: data.summary.criticalCount,
        warningCount: data.summary.warningCount,
        infoCount: data.summary.infoCount
    });

    // Log first few issues to verify they're being passed
    if (data.issues.length > 0) {
        console.log('[PDF Export] Sample issues:', data.issues.slice(0, 3));
    }

    // DIAGNOSTIC CHECK 2: Validate data
    if (!data.fileName) {
        throw new Error('PDF Export Error: fileName is required');
    }
    if (!data.issues) {
        throw new Error('PDF Export Error: issues array is required');
    }
    if (!data.summary) {
        throw new Error('PDF Export Error: summary object is required');
    }

    // Dynamic import to avoid SSR issues
    const html2pdfModule = await import('html2pdf.js');
    const html2pdf =
        (html2pdfModule as any).default ??
        (html2pdfModule as any).default?.default ??
        (html2pdfModule as any).html2pdf ??
        (html2pdfModule as any).default?.html2pdf ??
        html2pdfModule;

    if (typeof html2pdf !== 'function') {
        throw new Error('PDF Export Error: html2pdf.js did not load correctly');
    }

    console.log('[PDF Export] html2pdf library loaded successfully');

    // Helper to group issues by stage
    function getIssueStage(ruleId?: string): string {
        if (!ruleId) return "stage1-2";
        if (ruleId.startsWith("photo_")) return "stage-photo";
        if (ruleId.startsWith("contextual_")) return "stage5-contextual";
        if (ruleId.startsWith("pattern_")) return "stage4";
        if (ruleId.startsWith("cross_doc_") || ruleId.startsWith("structured_") || ruleId.startsWith("risk_matrix_") || ruleId.startsWith("height_work_")) return "stage3";
        return "stage1-2";
    }

    const tbmSummary = (data.tbmSummary || "").trim();

    // Create HTML template
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap" rel="stylesheet">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Nanum Myeongjo', 'Nanum Myeongjo', serif;
                    line-height: 1.8;
                    color: #1e293b;
                    padding: 40px;
                    background: white;
                    font-size: 14px;
                }

                .header {
                    text-align: center;
                    margin-bottom: 40px;
                    padding-bottom: 20px;
                    border-bottom: 3px solid #22c55e;
                }

                .header h1 {
                    font-size: 32px;
                    font-weight: bold;
                    color: #0f172a;
                    margin-bottom: 10px;
                }

                .header .subtitle {
                    font-size: 14px;
                    color: #64748b;
                    font-weight: 600;
                }

                .info-box {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 30px;
                }

                .info-row {
                    display: flex;
                    padding: 8px 0;
                    border-bottom: 1px solid #e2e8f0;
                }

                .info-row:last-child {
                    border-bottom: none;
                }

                .info-label {
                    font-weight: bold;
                    color: #475569;
                    width: 120px;
                    flex-shrink: 0;
                }

                .info-value {
                    color: #0f172a;
                    flex: 1;
                }

                .section {
                    margin-bottom: 30px;
                    page-break-inside: avoid;
                }

                .section-title {
                    font-size: 20px;
                    font-weight: bold;
                    color: #0f172a;
                    margin-bottom: 15px;
                    padding: 10px 15px;
                    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                    color: white;
                    border-radius: 6px;
                }

                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 15px;
                    margin-bottom: 30px;
                }

                .summary-card {
                    background: white;
                    border: 2px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                }

                .summary-label {
                    font-size: 12px;
                    color: #64748b;
                    font-weight: 600;
                    margin-bottom: 8px;
                }

                .summary-value {
                    font-size: 28px;
                    font-weight: bold;
                    color: #0f172a;
                }

                .issues-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                }

                .issues-table th {
                    background: #f1f5f9;
                    padding: 12px;
                    text-align: left;
                    font-weight: bold;
                    color: #475569;
                    border-bottom: 2px solid #cbd5e1;
                    font-size: 14px;
                }

                .issues-table td {
                    padding: 12px;
                    border-bottom: 1px solid #e2e8f0;
                    font-size: 13px;
                }

                .issues-table tr:last-child td {
                    border-bottom: none;
                }

                .issues-table tr:nth-child(even) {
                    background: #f8fafc;
                }

                .severity-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                }

                .issue-number {
                    font-weight: bold;
                    color: #64748b;
                }

                .issue-title {
                    font-weight: 600;
                    color: #0f172a;
                    margin-bottom: 4px;
                }

                .issue-message {
                    color: #64748b;
                    font-size: 12px;
                    line-height: 1.5;
                }

                .footer {
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 2px solid #e2e8f0;
                    text-align: center;
                    color: #94a3b8;
                    font-size: 11px;
                }

                .no-issues {
                    text-align: center;
                    padding: 40px;
                    color: #22c55e;
                    font-size: 16px;
                    font-weight: 600;
                    background: #f0fdf4;
                    border-radius: 8px;
                    border: 2px solid #bbf7d0;
                }

                /* AI Summary */
                .ai-summary {
                    background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%);
                    border: 1px solid #bfdbfe;
                    border-left: 4px solid #3b82f6;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                    font-size: 13px;
                    line-height: 1.8;
                    color: #1e3a5f;
                }
                .ai-summary-label {
                    font-size: 11px;
                    font-weight: 700;
                    color: #3b82f6;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 8px;
                }

                /* Document Data Section */
                .doc-data-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .doc-data-item {
                    display: flex;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border-radius: 6px;
                    border: 1px solid #e2e8f0;
                }
                .doc-data-label {
                    font-weight: 700;
                    color: #475569;
                    width: 100px;
                    flex-shrink: 0;
                    font-size: 12px;
                }
                .doc-data-value {
                    color: #0f172a;
                    font-size: 13px;
                }

                /* Signature indicators */
                .sig-present { color: #16a34a; font-weight: 700; }
                .sig-missing { color: #dc2626; font-weight: 700; }

                /* Risk Score */
                .risk-score-box {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    padding: 20px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    margin-bottom: 20px;
                }
                .risk-score-circle {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    font-weight: 800;
                    color: white;
                    flex-shrink: 0;
                }
                .risk-high { background: linear-gradient(135deg, #ef4444, #dc2626); }
                .risk-medium { background: linear-gradient(135deg, #f97316, #ea580c); }
                .risk-low { background: linear-gradient(135deg, #22c55e, #16a34a); }
                .risk-factors {
                    flex: 1;
                    font-size: 12px;
                    color: #475569;
                    line-height: 1.6;
                }
                .risk-factor-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 3px 0;
                    border-bottom: 1px dotted #e2e8f0;
                }

                /* Checklist Table */
                .checklist-grid {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    font-size: 13px;
                }
                .checklist-grid th {
                    background: #f1f5f9;
                    padding: 10px;
                    text-align: left;
                    font-weight: 700;
                    color: #475569;
                    border-bottom: 2px solid #cbd5e1;
                }
                .checklist-grid td {
                    padding: 8px 10px;
                    border-bottom: 1px solid #e2e8f0;
                }
                .checklist-grid tr:nth-child(even) { background: #f8fafc; }
                .check-pass { color: #16a34a; font-weight: 700; font-size: 16px; }
                .check-fail { color: #dc2626; font-weight: 700; font-size: 16px; }
                .check-na { color: #94a3b8; font-size: 12px; }

                /* Issue stage headers */
                .stage-header {
                    font-size: 14px;
                    font-weight: 700;
                    padding: 8px 12px;
                    border-radius: 6px;
                    margin: 15px 0 10px 0;
                    color: white;
                }
                .stage-format { background: linear-gradient(135deg, #ef4444, #dc2626); }
                .stage-cross { background: linear-gradient(135deg, #3b82f6, #2563eb); }
                .stage-pattern { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
                .stage-contextual { background: linear-gradient(135deg, #14b8a6, #0d9488); }
                .stage-photo { background: linear-gradient(135deg, #22c55e, #16a34a); }

                .tbm-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;}
                .tbm-text{white-space:pre-wrap;color:#0f172a;font-size:13px;line-height:1.7;}

                /* Root Cause Summary */
                .root-cause-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                    margin-top: 15px;
                }
                .root-cause-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 15px;
                    background: #f8fafc;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }
                .root-cause-label {
                    font-weight: 600;
                    color: #475569;
                    font-size: 13px;
                }
                .root-cause-count {
                    font-weight: 700;
                    color: #6b21a8;
                    font-size: 16px;
                    background: #f3e8ff;
                    padding: 4px 12px;
                    border-radius: 12px;
                }
                .root-cause-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    background: #f3e8ff;
                    color: #6b21a8;
                    margin-left: 8px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>안전 점검 보고서</h1>
                <div class="subtitle">스마트 안전지킴이 - 경상남도 중소기업 지원 시스템</div>
            </div>

            <div class="info-box">
                <div class="info-row">
                    <div class="info-label">파일명</div>
                    <div class="info-value">${escapeHtml(data.fileName)}</div>
                </div>
                ${data.projectName ? `
                <div class="info-row">
                    <div class="info-label">프로젝트</div>
                    <div class="info-value">${escapeHtml(data.projectName)}</div>
                </div>
                ` : ''}
                ${data.documentType ? `
                <div class="info-row">
                    <div class="info-label">문서 유형</div>
                    <div class="info-value">${escapeHtml(data.documentType)}</div>
                </div>
                ` : ''}
                ${data.extractedData?.inspectorName ? `
                <div class="info-row">
                    <div class="info-label">점검자</div>
                    <div class="info-value">${escapeHtml(data.extractedData.inspectorName)}</div>
                </div>
                ` : ''}
                <div class="info-row">
                    <div class="info-label">생성 날짜</div>
                    <div class="info-value">${data.createdAt.toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}</div>
                </div>
            </div>

            ${data.aiSummary ? `
            <div class="section">
                <div class="ai-summary">
                    <div class="ai-summary-label">AI 분석 요약</div>
                    ${escapeHtml(data.aiSummary)}
                </div>
            </div>
            ` : ''}

            ${data.extractedData?.fields ? `
            <div class="section">
                <div class="section-title">문서 추출 정보</div>
                <div class="doc-data-grid">
                    <div class="doc-data-item">
                        <div class="doc-data-label">문서 유형</div>
                        <div class="doc-data-value">${escapeHtml(data.extractedData.docType || "미확인")}</div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">점검일자</div>
                        <div class="doc-data-value">${escapeHtml(data.extractedData.fields.점검일자 || "미기재")}</div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">현장명</div>
                        <div class="doc-data-value">${escapeHtml(data.extractedData.fields.현장명 || "미기재")}</div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">작업내용</div>
                        <div class="doc-data-value">${escapeHtml(data.extractedData.fields.작업내용 || "미기재")}</div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">작업인원</div>
                        <div class="doc-data-value">${escapeHtml(data.extractedData.fields.작업인원 || "미기재")}</div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">점검자</div>
                        <div class="doc-data-value">${escapeHtml(data.extractedData.inspectorName || "미기재")}</div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">담당자 서명</div>
                        <div class="doc-data-value ${data.extractedData.signature?.담당 === "present" ? "sig-present" : "sig-missing"}">
                            ${data.extractedData.signature?.담당 === "present" ? "서명 있음" : data.extractedData.signature?.담당 === "missing" ? "미서명" : "확인 불가"}
                        </div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">소장 서명</div>
                        <div class="doc-data-value ${data.extractedData.signature?.소장 === "present" ? "sig-present" : "sig-missing"}">
                            ${data.extractedData.signature?.소장 === "present" ? "서명 있음" : data.extractedData.signature?.소장 === "missing" ? "미서명" : "확인 불가"}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            ${data.riskScore ? `
            <div class="section">
                <div class="section-title">위험도 평가</div>
                <div class="risk-score-box">
                    <div class="risk-score-circle risk-${data.riskScore.level}">
                        ${data.riskScore.score}
                    </div>
                    <div class="risk-factors">
                        <div style="font-weight:700; font-size:14px; margin-bottom:8px; color:#0f172a;">
                            위험등급: ${data.riskScore.level === "high" ? "높음 (High)" : data.riskScore.level === "medium" ? "보통 (Medium)" : "낮음 (Low)"}
                        </div>
                        ${(data.riskScore.factors || []).map(f => `
                            <div class="risk-factor-item">
                                <span>${escapeHtml(f.name)}</span>
                                <span style="font-weight:700;">+${f.points}점</span>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>
            ` : ''}

            ${data.checklist && data.checklist.length > 0 ? `
            <div class="section">
                <div class="section-title">안전 점검 체크리스트</div>
                <table class="checklist-grid">
                    <thead>
                        <tr>
                            <th style="width:50%;">점검 항목</th>
                            <th style="width:15%; text-align:center;">분류</th>
                            <th style="width:15%; text-align:center;">결과</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.checklist.map(c => `
                            <tr>
                                <td>${escapeHtml(c.nameKo)}</td>
                                <td style="text-align:center; font-size:12px; color:#64748b;">${escapeHtml(c.category)}</td>
                                <td style="text-align:center;">
                                    ${c.value === "✔" ? '<span class="check-pass">적합</span>' :
                                        c.value === "✖" ? '<span class="check-fail">부적합</span>' :
                                        '<span class="check-na">N/A</span>'}
                                </td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <div class="section">
                <div class="section-title">검증 요약</div>
                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="summary-label">총 문제점</div>
                        <div class="summary-value">${data.summary.totalIssues}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">심각한 문제</div>
                        <div class="summary-value" style="color: #ef4444;">${data.summary.criticalCount}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">경고</div>
                        <div class="summary-value" style="color: #f97316;">${data.summary.warningCount}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">정보</div>
                        <div class="summary-value" style="color: #3b82f6;">${data.summary.infoCount}</div>
                    </div>
                </div>
            </div>

            ${(() => {
                // Calculate root cause summary
                const rootCauseCounts: Record<string, { nameKo: string; nameEn: string; count: number }> = {};
                for (const issue of data.issues) {
                    if (issue.rootCause) {
                        if (!rootCauseCounts[issue.rootCause.id]) {
                            rootCauseCounts[issue.rootCause.id] = {
                                nameKo: issue.rootCause.nameKo,
                                nameEn: issue.rootCause.nameEn,
                                count: 0
                            };
                        }
                        rootCauseCounts[issue.rootCause.id].count++;
                    }
                }
                const rootCauseEntries = Object.entries(rootCauseCounts).sort((a, b) => b[1].count - a[1].count);

                if (rootCauseEntries.length === 0) return '';

                return `
            <div class="section">
                <div class="section-title">근본 원인 분석 (연구 기반)</div>
                <p style="font-size: 12px; color: #64748b; margin-bottom: 15px;">
                    Kim & Chi (2020), Hwang et al. (2023) 연구에 기반한 건설 안전사고 근본 원인 분류
                </p>
                <div class="root-cause-grid">
                    ${rootCauseEntries.map(([id, rc]) => `
                        <div class="root-cause-item">
                            <span class="root-cause-label">${escapeHtml(rc.nameKo)} <span style="font-size:10px;color:#94a3b8;">(${escapeHtml(rc.nameEn)})</span></span>
                            <span class="root-cause-count">${rc.count}건</span>
                        </div>
                    `).join('')}
                </div>
            </div>
                `;
            })()}

            <div class="section">
                <div class="section-title">발견된 문제점</div>
                ${data.issues.length === 0 ? `
                    <div class="no-issues">
                        발견된 문제가 없습니다. 모든 검증을 통과했습니다!
                    </div>
                ` : (() => {
                    // Group issues by stage
                    const stage12 = data.issues.filter(i => getIssueStage(i.ruleId) === "stage1-2");
                    const stage3 = data.issues.filter(i => getIssueStage(i.ruleId) === "stage3");
                    const stage4 = data.issues.filter(i => getIssueStage(i.ruleId) === "stage4");
                    const contextual = data.issues.filter(i => getIssueStage(i.ruleId) === "stage5-contextual");
                    const photo = data.issues.filter(i => getIssueStage(i.ruleId) === "stage-photo");

                    function renderIssueGroup(groupIssues: typeof data.issues, stageClass: string, stageLabel: string) {
                        if (groupIssues.length === 0) return "";
                        return `
                            <div class="stage-header ${stageClass}">${stageLabel} (${groupIssues.length}건)</div>
                            <table class="issues-table">
                                <tbody>
                                    ${groupIssues.map((issue) => `
                                        <tr>
                                            <td style="width:80px;">
                                                <span class="severity-badge" style="background:${getSeverityBgColor(issue.severity)}; color:${getSeverityColor(issue.severity)};">
                                                    ${getSeverityKorean(issue.severity)}
                                                </span>
                                            </td>
                                            <td>
                                                <div class="issue-title">
                                                    ${escapeHtml(issue.title)}
                                                    ${issue.rootCause ? `<span class="root-cause-badge">${escapeHtml(issue.rootCause.nameKo)}</span>` : ''}
                                                </div>
                                                <div class="issue-message">${escapeHtml(issue.message)}</div>
                                            </td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        `;
                    }

                    let html = "";
                    html += renderIssueGroup(stage12, "stage-format", "형식 및 논리 검증");
                    html += renderIssueGroup(stage3, "stage-cross", "교차 검증 및 위험도");
                    html += renderIssueGroup(stage4, "stage-pattern", "행동 패턴 분석");
                    html += renderIssueGroup(contextual, "stage-contextual", "맥락적 안전 분석");
                    html += renderIssueGroup(photo, "stage-photo", "사진-문서 교차검증");

                    return html;
                })()}
            </div>

            ${data.crossValidation ? `
            <div class="section">
                <div class="section-title">사진-문서 교차검증 결과</div>
                <div class="doc-data-grid">
                    <div class="doc-data-item">
                        <div class="doc-data-label">비교 문서</div>
                        <div class="doc-data-value">${escapeHtml(data.crossValidation.comparedWith || "최근 점검표")}</div>
                    </div>
                    <div class="doc-data-item">
                        <div class="doc-data-label">불일치 수</div>
                        <div class="doc-data-value" style="color: ${(data.crossValidation.mismatches || 0) > 0 ? '#dc2626' : '#16a34a'}; font-weight:700;">
                            ${data.crossValidation.mismatches || 0}건
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            ${tbmSummary.length > 0 ? `
            <div class="section">
                <div class="section-title">TBM 요약</div>
                <div class="tbm-box">
                    <div class="tbm-text">${escapeHtml(tbmSummary)}</div>
                </div>
            </div>
            ` : ''}

            <div class="footer">
                <div>Generated by Smart Safety Guardian (스마트 안전지킴이)</div>
                <div style="margin-top: 5px;">Luna Team - GNU RISE AI+X Competition 2026</div>
                <div style="margin-top:5px; font-size:10px;">
                    검증 단계: 형식검증 - 논리검증 - 교차분석 - 패턴감지 - 맥락분석
                    ${data.crossValidation ? ' - 사진교차검증' : ''}
                </div>
            </div>
        </body>
        </html>
    `;

    // Create overlay container for better UX
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '999999';
    overlay.style.background = 'rgba(0, 0, 0, 0.8)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'flex-start';
    overlay.style.justifyContent = 'center';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '20px';
    overlay.style.overflow = 'auto';
    overlay.style.padding = '40px 20px';

    // Loading message
    const loadingMsg = document.createElement('div');
    loadingMsg.style.color = 'white';
    loadingMsg.style.fontSize = '20px';
    loadingMsg.style.fontWeight = 'bold';
    loadingMsg.textContent = 'PDF 생성 중... 잠시만 기다려주세요';
    overlay.appendChild(loadingMsg);

    // Create the actual PDF content container
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // CRITICAL: Element must be visible and properly rendered for html2canvas
    tempDiv.style.position = 'relative'; // Normal flow
    tempDiv.style.width = '210mm'; // A4 width
    tempDiv.style.maxWidth = '1200px'; // Wider preview for readability
    tempDiv.style.minHeight = '100%'; // Ensure full height
    tempDiv.style.height = 'auto'; // Auto height for all content
    tempDiv.style.background = 'white'; // Ensure white background
    tempDiv.style.padding = '0'; // Remove padding - HTML has its own
    tempDiv.style.overflow = 'visible'; // CRITICAL: Must be visible for full capture
    tempDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
    // REMOVED maxHeight constraint - this was cutting off content!
    tempDiv.style.overflowY = 'visible'; // Changed from 'auto' to 'visible'

    overlay.appendChild(tempDiv);

    console.log('[PDF Export] Created temp container, HTML length:', htmlContent.length);
    console.log('[PDF Export] Appending overlay to document body...');

    document.body.appendChild(overlay);

    // DIAGNOSTIC CHECK 3: Wait for DOM, fonts, and rendering
    console.log('[PDF Export] Waiting for fonts and rendering...');

    // Wait for fonts to load (including Google Fonts)
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
        console.log('[PDF Export] System fonts loaded');
    }

    // Additional wait for layout painting
    // NOTE: Font is now preloaded on app startup, so we can reduce wait time significantly
    await new Promise(resolve => setTimeout(resolve, 800)); // Reduced from 2500ms to 800ms (font preloaded!)
    console.log('[PDF Export] Layout fully rendered (font preloaded)');

    // Log actual dimensions being captured
    console.log('[PDF Export] Element dimensions:', {
        scrollWidth: tempDiv.scrollWidth,
        scrollHeight: tempDiv.scrollHeight,
        offsetWidth: tempDiv.offsetWidth,
        offsetHeight: tempDiv.offsetHeight,
        clientHeight: tempDiv.clientHeight
    });

    // FIX: Check if fileName already contains a date pattern (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}_/;
    let finalFilename: string;

    if (datePattern.test(data.fileName)) {
        // FileName already has date, don't add it again
        const cleanFileName = data.fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
        finalFilename = `${cleanFileName}_report.pdf`;
        console.log('[PDF Export] Filename already has date, using:', finalFilename);
    } else {
        // Add date prefix
        const dateStr = data.createdAt.toISOString().split('T')[0];
        const cleanFileName = data.fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
        finalFilename = `${dateStr}_${cleanFileName}_report.pdf`;
        console.log('[PDF Export] Adding date prefix:', finalFilename);
    }

    // PDF options - optimized for content capture
    const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: finalFilename,
        image: { type: 'png' as const, quality: 1.0 }, // PNG for sharper text
        html2canvas: {
            scale: 3, // Increased from 2 to 3 for much sharper text
            useCORS: true,
            letterRendering: true,
            logging: true, // ENABLE logging for debugging
            allowTaint: false,
            backgroundColor: '#ffffff',
            scrollY: -window.scrollY, // Ensure we capture from top
            scrollX: -window.scrollX,
            windowWidth: tempDiv.scrollWidth,
            windowHeight: tempDiv.scrollHeight,
            width: tempDiv.scrollWidth,
            height: tempDiv.scrollHeight,
            onclone: (clonedDoc: Document) => {
                // Ensure cloned document has same styles and full height
                console.log('[PDF Export] Document cloned for rendering');
                const clonedElement = clonedDoc.body.querySelector('div');
                if (clonedElement) {
                    (clonedElement as HTMLElement).style.maxHeight = 'none';
                    (clonedElement as HTMLElement).style.height = 'auto';
                    (clonedElement as HTMLElement).style.overflow = 'visible';
                    (clonedElement as HTMLElement).style.position = 'relative';
                    console.log('[PDF Export] Cloned element height:', (clonedElement as HTMLElement).scrollHeight);
                }
            }
        },
        jsPDF: {
            unit: 'mm' as const,
            format: 'a4' as const,
            orientation: 'portrait' as const,
            compress: false // Disable compression for better quality
        },
        pagebreak: {
            mode: ['avoid-all', 'css', 'legacy'],
            before: '.section', // Add page breaks before sections if needed
            after: '.page-break'
        }
    };

    // Generate PDF
    try {
        console.log('[PDF Export] Starting html2pdf conversion...');
        console.log('[PDF Export] Options:', opt);

        // Use outputPdf to get the blob first for better error tracking
        const worker = html2pdf()
            .set(opt)
            .from(tempDiv);

        let pdfBlob: Blob | null = null;
        if (typeof (worker as any).outputPdf === 'function') {
            pdfBlob = await (worker as any).outputPdf('blob');
        } else if (typeof (worker as any).output === 'function') {
            pdfBlob = await (worker as any).output('blob');
        } else {
            await (worker as any).save();
        }

        if (!pdfBlob) {
            loadingMsg.textContent = '✓ PDF 생성 완료';
            loadingMsg.style.color = '#22c55e';
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                    console.log('[PDF Export] Overlay cleaned up');
                }
            }, 1000);
            return;
        }

        console.log('[PDF Export] PDF blob generated successfully, size:', pdfBlob.size, 'bytes');

        // DIAGNOSTIC CHECK 4: Verify PDF is not empty
        if (pdfBlob.size === 0 || pdfBlob.size < 1000) {
            throw new Error(`PDF Export Error: Generated PDF is too small (${pdfBlob.size} bytes). This usually means the content failed to render.`);
        }

        // Now trigger the download with the blob
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('[PDF Export] PDF download triggered successfully:', finalFilename);

        // Update loading message to show success
        loadingMsg.textContent = `✓ PDF 생성 완료! (${Math.round(pdfBlob.size / 1024)}KB)`;
        loadingMsg.style.color = '#22c55e';

        // Remove overlay after short delay
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
                console.log('[PDF Export] Overlay cleaned up');
            }
        }, 1000);
    } catch (error: any) {
        // DIAGNOSTIC CHECK 5: Enhanced error logging
        console.error('[PDF Export] CRITICAL ERROR during PDF generation:');
        console.error('[PDF Export] Error type:', error.constructor.name);
        console.error('[PDF Export] Error message:', error.message);
        console.error('[PDF Export] Error stack:', error.stack);
        console.error('[PDF Export] Full error object:', error);

        // Update loading message to show error
        loadingMsg.textContent = '❌ PDF 생성 실패';
        loadingMsg.style.color = '#ef4444';

        // Clean up on error
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
                console.log('[PDF Export] Overlay cleaned up after error');
            }
        }, 2000);

        // Re-throw with more context
        throw new Error(`PDF generation failed: ${error.message || 'Unknown error'}`);
    }
}
