export const runtime = "nodejs";

import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

interface ExportData {
  // Existing fields (keep all)
  fileName: string;
  projectName?: string;
  documentType?: string | null;
  createdAt: string; // ISO string
  tbmSummary?: string;
  tbmTranscript?: string;

  // [Brief #5] Narrative content captured from chat
  synthesisNarrative?: string;   // AI's three-way synthesis response
  correctiveAction?: string;     // AI's corrective action notice
  // Brief #3: Engagement quality scoring
  engagementScore?: {
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
  };
  issues?: Array<{
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
  const map: Record<string, string> = { error: "심각", warn: "경고", info: "정보" };
  return map[severity] || severity;
}

function getSeverityColor(severity: string): string {
  const map: Record<string, string> = { error: "#ef4444", warn: "#f97316", info: "#3b82f6" };
  return map[severity] || "#64748b";
}

function getSeverityBgColor(severity: string): string {
  const map: Record<string, string> = { error: "#fee2e2", warn: "#ffedd5", info: "#dbeafe" };
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

/**
 * Simple markdown to HTML converter for PDF narratives
 * Handles: headers, bold, italic, lists, tables, horizontal rules
 */
function markdownToHtml(markdown: string | undefined | null): string {
  if (!markdown) return "";

  let html = escapeHtml(markdown);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;margin:14px 0 6px 0;color:#1e293b;">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 style="font-size:15px;font-weight:700;margin:18px 0 8px 0;color:#0f172a;">$1</h3>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Process lines
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let i = 0;

  // Helper to parse table
  function parseTable(startIdx: number): { html: string; endIdx: number } {
    const rows: string[][] = [];
    let idx = startIdx;
    let hasHeader = false;

    while (idx < lines.length) {
      const line = lines[idx].trim();
      if (!line.startsWith('|') || !line.endsWith('|')) break;
      if (line.match(/^\|[\s-:]+\|$/)) { hasHeader = rows.length > 0; idx++; continue; }
      rows.push(line.slice(1, -1).split('|').map(c => c.trim()));
      idx++;
    }

    if (rows.length === 0) return { html: '', endIdx: startIdx };

    let tbl = '<table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:12px;">';
    rows.forEach((row, rowIdx) => {
      const isHead = hasHeader && rowIdx === 0;
      const tag = isHead ? 'th' : 'td';
      const style = isHead
        ? 'style="background:#f1f5f9;padding:6px 10px;text-align:left;font-weight:600;border:1px solid #e2e8f0;"'
        : 'style="padding:6px 10px;border:1px solid #e2e8f0;"';
      tbl += '<tr>' + row.map(c => `<${tag} ${style}>${c}</${tag}>`).join('') + '</tr>';
    });
    tbl += '</table>';
    return { html: tbl, endIdx: idx };
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Horizontal rule
    if (trimmed.match(/^-{3,}$/) || trimmed.match(/^\*{3,}$/) || trimmed.match(/^_{3,}$/)) {
      if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      result.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0;">');
      i++; continue;
    }

    // Table
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      const { html: tblHtml, endIdx } = parseTable(i);
      if (tblHtml) { result.push(tblHtml); i = endIdx; continue; }
    }

    // Bullet
    if (trimmed.match(/^[-•] /)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ul style="margin:8px 0;padding-left:18px;">');
        inList = true; listType = 'ul';
      }
      result.push(`<li style="margin:5px 0;line-height:1.5;">${trimmed.replace(/^[-•] /, '')}</li>`);
      i++; continue;
    }

    // Numbered
    if (trimmed.match(/^\d+\. /)) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
        result.push('<ol style="margin:8px 0;padding-left:18px;">');
        inList = true; listType = 'ol';
      }
      result.push(`<li style="margin:5px 0;line-height:1.5;">${trimmed.replace(/^\d+\. /, '')}</li>`);
      i++; continue;
    }

    // Headers (already processed)
    if (trimmed.startsWith('<h3') || trimmed.startsWith('<h4')) {
      if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      result.push(trimmed);
      i++; continue;
    }

    // Empty line
    if (trimmed === '') {
      if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      i++; continue;
    }

    // Regular text
    if (inList) { result.push(listType === 'ol' ? '</ol>' : '</ul>'); inList = false; }
    result.push(`<p style="margin:6px 0;line-height:1.6;">${trimmed}</p>`);
    i++;
  }

  if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
  return result.join('');
}

function buildHTMLContent(data: ExportData): string {
  const createdAt = new Date(data.createdAt);
  const issues = Array.isArray(data.issues) ? data.issues : [];

  const tbmSummary = (data.tbmSummary || "").trim();
  const tbmTranscript = (data.tbmTranscript || "").trim();

  // [Brief #5] Check for narrative content
  const hasSynthesis = !!(data.synthesisNarrative?.trim());
  const hasCorrectiveAction = !!(data.correctiveAction?.trim());

  // Helper to group issues by stage
  function getIssueStage(ruleId?: string): string {
    if (!ruleId) return "stage1-2";
    if (ruleId.startsWith("photo_")) return "stage-photo";
    if (ruleId.startsWith("contextual_")) return "stage5-contextual";
    if (ruleId.startsWith("pattern_")) return "stage4";
    if (ruleId.startsWith("cross_doc_") || ruleId.startsWith("structured_") || ruleId.startsWith("risk_matrix_") || ruleId.startsWith("height_work_")) return "stage3";
    return "stage1-2";
  }

  // [Brief #5] Build root cause summary HTML
  function buildRootCauseSummaryHTML(): string {
    const rootCauseCounts: Record<string, { nameKo: string; nameEn: string; count: number }> = {};
    for (const issue of issues) {
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
    const entries = Object.entries(rootCauseCounts).sort((a, b) => b[1].count - a[1].count);
    if (entries.length === 0) return '';

    const primaryName = entries[0][1].nameKo;

    let html = `<div style="margin-bottom:10px;font-size:14px;font-weight:600;">
      주요 근본 원인: <span style="background:#6b21a8;color:white;padding:2px 10px;border-radius:4px;font-size:12px;">${escapeHtml(primaryName)}</span>
    </div>`;

    html += entries.map(([, rc]) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;">
        <span style="background:#f3e8ff;color:#6b21a8;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escapeHtml(rc.nameKo)}</span>
        <span style="color:#475569;">${rc.count}건</span>
      </div>
    `).join('');

    return html;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{
      font-family:'Nanum Myeongjo', serif;
      line-height:1.8;color:#1e293b;padding:40px;background:white;font-size:14px;
    }
    .header{text-align:center;margin-bottom:40px;padding-bottom:20px;border-bottom:3px solid #334155;}
    .header h1{font-size:32px;font-weight:bold;color:#0f172a;margin-bottom:10px;}
    .header .subtitle{font-size:14px;color:#64748b;font-weight:600;}
    .info-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:20px;}
    .info-row{display:flex;padding:8px 0;border-bottom:1px solid #e2e8f0;}
    .info-row:last-child{border-bottom:none;}
    .info-label{font-weight:bold;color:#475569;width:120px;flex-shrink:0;}
    .info-value{color:#0f172a;flex:1;}
    .section{margin-bottom:20px;page-break-inside:avoid;}
    .section-title{
      font-size:18px;font-weight:bold;color:white;margin-bottom:15px;padding:10px 15px;
      background:linear-gradient(135deg,#334155 0%,#1e293b 100%);border-radius:6px;
    }
    .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-bottom:20px;}
    .summary-card{background:white;border:2px solid #e2e8f0;border-radius:8px;padding:15px;text-align:center;}
    .summary-label{font-size:12px;color:#64748b;font-weight:600;margin-bottom:8px;}
    .summary-value{font-size:28px;font-weight:bold;color:#0f172a;}

    .tbm-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;}
    .tbm-text{white-space:pre-wrap;color:#0f172a;font-size:13px;line-height:1.7;}
    .muted{color:#94a3b8;font-size:13px;}

    .issues-table{width:100%;border-collapse:collapse;margin-top:15px;}
    .issues-table th{
      background:#f1f5f9;padding:12px;text-align:left;font-weight:bold;color:#475569;
      border-bottom:2px solid #cbd5e1;font-size:14px;
    }
    .issues-table td{padding:12px;border-bottom:1px solid #e2e8f0;font-size:13px;}
    .issues-table tr:last-child td{border-bottom:none;}
    .issues-table tr:nth-child(even){background:#f8fafc;}
    .severity-badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:bold;}
    .issue-number{font-weight:bold;color:#64748b;}
    .issue-title{font-weight:600;color:#0f172a;margin-bottom:4px;}
    .issue-message{color:#64748b;font-size:12px;line-height:1.5;}
    .footer{margin-top:40px;padding-top:20px;border-top:2px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;}
    .no-issues{
      text-align:center;padding:40px;color:#334155;font-size:16px;font-weight:600;
      background:#f8fafc;border-radius:8px;border:2px solid #e2e8f0;
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

    /* Issue stage headers - muted, professional colors */
    .stage-header {
      font-size: 13px;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 4px;
      margin: 15px 0 10px 0;
      border-left: 4px solid;
    }
    .stage-format { background: #fef2f2; color: #991b1b; border-color: #dc2626; }
    .stage-cross { background: #eff6ff; color: #1e40af; border-color: #3b82f6; }
    .stage-pattern { background: #f5f3ff; color: #5b21b6; border-color: #8b5cf6; }
    .stage-contextual { background: #f0fdfa; color: #115e59; border-color: #14b8a6; }
    .stage-photo { background: #f0fdf4; color: #166534; border-color: #22c55e; }

    /* Root Cause Summary */
    .root-cause-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin-top: 12px;
    }
    .root-cause-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: #f8fafc;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .root-cause-label {
      font-weight: 600;
      color: #334155;
      font-size: 13px;
    }
    .root-cause-count {
      font-weight: 700;
      color: #334155;
      font-size: 14px;
      background: #e2e8f0;
      padding: 4px 12px;
      border-radius: 12px;
    }
    .root-cause-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      background: #f1f5f9;
      color: #475569;
      margin-left: 8px;
    }

    /* [Brief #5] Narrative-First Layout Styles */
    .situation-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .situation-row {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    .situation-item {
      flex: 1;
      min-width: 120px;
    }
    .situation-label {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .situation-value {
      font-size: 14px;
      color: #1e293b;
      font-weight: 600;
    }

    .severity-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      padding: 12px 16px;
      background: #f8fafc;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .severity-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    .severity-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .narrative-section {
      margin-bottom: 24px;
      padding: 20px 24px;
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      border-radius: 0 8px 8px 0;
    }
    .narrative-section.critical {
      background: #fef2f2;
      border-left-color: #ef4444;
    }
    .narrative-section h3 {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }
    .narrative-text {
      font-size: 13px;
      line-height: 1.7;
      color: #334155;
    }
    .narrative-text p {
      margin: 5px 0;
    }
    .narrative-text ul, .narrative-text ol {
      margin: 6px 0;
      padding-left: 18px;
    }
    .narrative-text li {
      margin: 3px 0;
    }
    .narrative-text h3, .narrative-text h4 {
      color: #1e293b;
    }

    .root-cause-box {
      margin-bottom: 24px;
      padding: 16px 20px;
      background: #faf5ff;
      border: 1px solid #e9d5ff;
      border-radius: 8px;
    }
    .root-cause-box h3 {
      font-size: 14px;
      font-weight: 700;
      color: #6b21a8;
      margin-bottom: 10px;
    }

    .corrective-section {
      margin-bottom: 24px;
      padding: 20px 24px;
      background: #f0fdf4;
      border-left: 4px solid #22c55e;
      border-radius: 0 8px 8px 0;
    }
    .corrective-section h3 {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }

    .evidence-divider {
      page-break-before: always;
      margin-top: 0;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
    }
    .evidence-divider h2 {
      font-size: 18px;
      color: #475569;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <!-- ============================================ -->
  <!-- PAGE 1: THE STORY (for site manager)         -->
  <!-- ============================================ -->

  <div class="header">
    <h1>안전 문서 검증 보고서</h1>
    <div class="subtitle">Smart Safety Guardian | ${escapeHtml(data.projectName) || "프로젝트 미지정"}</div>
  </div>

  <!-- Situation Summary - one glance context -->
  <div class="situation-box">
    <div class="situation-row">
      <div class="situation-item">
        <div class="situation-label">현장 / 프로젝트</div>
        <div class="situation-value">${escapeHtml(data.extractedData?.fields?.현장명) || escapeHtml(data.projectName) || "-"}</div>
      </div>
      <div class="situation-item">
        <div class="situation-label">점검일</div>
        <div class="situation-value">${escapeHtml(data.extractedData?.fields?.점검일자) || createdAt.toISOString().split("T")[0]}</div>
      </div>
      <div class="situation-item">
        <div class="situation-label">작업내용</div>
        <div class="situation-value">${escapeHtml(data.extractedData?.fields?.작업내용) || "-"}</div>
      </div>
      <div class="situation-item">
        <div class="situation-label">문서유형</div>
        <div class="situation-value">${escapeHtml(data.documentType) || "-"}</div>
      </div>
    </div>
  </div>

  <!-- Severity Overview - compact bar -->
  <div class="severity-bar">
    <div class="severity-item">
      <div class="severity-dot" style="background: #ef4444;"></div>
      심각 ${data.summary.criticalCount}건
    </div>
    <div class="severity-item">
      <div class="severity-dot" style="background: #f97316;"></div>
      경고 ${data.summary.warningCount}건
    </div>
    <div class="severity-item">
      <div class="severity-dot" style="background: #3b82f6;"></div>
      정보 ${data.summary.infoCount}건
    </div>
    <div class="severity-item" style="margin-left: auto; font-weight: 700;">
      총 ${data.summary.totalIssues}건
    </div>
  </div>

  <!-- Synthesis Narrative - THE KEY SECTION -->
  ${hasSynthesis ? `
  <div class="narrative-section${data.summary.criticalCount > 0 ? " critical" : ""}">
    <h3>📋 종합 분석 결과</h3>
    <div class="narrative-text">${markdownToHtml(data.synthesisNarrative)}</div>
  </div>
  ` : `
  <div class="narrative-section">
    <h3>📋 검증 요약</h3>
    <div class="narrative-text">${markdownToHtml(data.aiSummary) || "AI 분석 결과가 없습니다. 채팅에서 종합 분석을 요청하세요."}</div>
  </div>
  `}

  <!-- Root Cause Diagnosis -->
  ${(() => {
    const rootCauseHtml = buildRootCauseSummaryHTML();
    if (!rootCauseHtml) return '';
    return `
  <div class="root-cause-box">
    <h3>🔍 근본 원인 진단</h3>
    ${rootCauseHtml}
  </div>
    `;
  })()}

  <!-- Corrective Action -->
  ${hasCorrectiveAction ? `
  <div class="corrective-section">
    <h3>📝 시정조치 요청</h3>
    <div class="narrative-text">${markdownToHtml(data.correctiveAction)}</div>
  </div>
  ` : ""}

  <!-- ============================================ -->
  <!-- PAGE 2+: THE EVIDENCE (supporting details)   -->
  <!-- ============================================ -->

  <div class="evidence-divider">
    <h2>📎 상세 검증 자료</h2>
  </div>

  <!-- Original info box (moved to evidence section) -->
  <div class="info-box">
    <div class="info-row">
      <div class="info-label">파일명</div>
      <div class="info-value">${escapeHtml(data.fileName)}</div>
    </div>
    ${data.projectName ? `
    <div class="info-row">
      <div class="info-label">프로젝트</div>
      <div class="info-value">${escapeHtml(data.projectName)}</div>
    </div>` : ""}
    ${data.documentType ? `
    <div class="info-row">
      <div class="info-label">문서 유형</div>
      <div class="info-value">${escapeHtml(data.documentType)}</div>
    </div>` : ""}
    ${data.extractedData?.inspectorName ? `
    <div class="info-row">
      <div class="info-label">점검자</div>
      <div class="info-value">${escapeHtml(data.extractedData.inspectorName)}</div>
    </div>` : ""}
    <div class="info-row">
      <div class="info-label">생성 날짜</div>
      <div class="info-value">${createdAt.toLocaleString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}</div>
    </div>
  </div>

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
  ` : ""}

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
  ` : ""}

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
  ` : ""}

  <div class="section">
    <div class="section-title">발견된 문제점</div>
    ${issues.length === 0 ? `
      <div class="no-issues">발견된 문제가 없습니다. 모든 검증을 통과했습니다!</div>
    ` : (() => {
      // Group issues by stage
      const stage12 = issues.filter(i => getIssueStage(i.ruleId) === "stage1-2");
      const stage3 = issues.filter(i => getIssueStage(i.ruleId) === "stage3");
      const stage4 = issues.filter(i => getIssueStage(i.ruleId) === "stage4");
      const contextual = issues.filter(i => getIssueStage(i.ruleId) === "stage5-contextual");
      const photo = issues.filter(i => getIssueStage(i.ruleId) === "stage-photo");

      function renderIssueGroup(groupIssues: typeof issues, stageClass: string, stageLabel: string) {
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
  ` : ""}

  ${tbmSummary.length > 0 ? `
  <div class="section">
    <div class="section-title">TBM 요약</div>
    <div class="tbm-box">
      <div class="tbm-text">${escapeHtml(tbmSummary)}</div>
    </div>
  </div>
  ` : ""}

  ${data.engagementScore ? `
  <div class="section">
    <div class="section-title">TBM 참여도 추정</div>
    <div style="background:${data.engagementScore.level === 'high' ? '#dcfce7' : data.engagementScore.level === 'medium' ? '#fef9c3' : '#fee2e2'};border:1px solid ${data.engagementScore.level === 'high' ? '#86efac' : data.engagementScore.level === 'medium' ? '#fde047' : '#fca5a5'};border-radius:8px;padding:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:700;font-size:15px;">참여도 추정</span>
        <span style="font-size:18px;font-weight:700;color:${data.engagementScore.level === 'high' ? '#16a34a' : data.engagementScore.level === 'medium' ? '#ca8a04' : '#dc2626'};">
          ${data.engagementScore.score}점 (${data.engagementScore.levelKo})
        </span>
      </div>
      <p style="font-size:10px;color:#6b7280;margin-bottom:12px;font-style:italic;">※ 음성 패턴 기반 추정치이며, 실제 상황과 다를 수 있습니다.</p>
      <div style="display:grid;gap:6px;margin-bottom:12px;">
        ${data.engagementScore.factors.map(f => `
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 8px;background:${f.detected ? '#f0fdf4' : '#fafafa'};border-radius:4px;">
            <span style="color:${f.detected ? '#15803d' : '#9ca3af'};">
              ${f.detected ? '✓' : '○'} ${escapeHtml(f.nameKo)}
            </span>
            <span style="color:${f.detected ? '#16a34a' : '#9ca3af'};">
              ${f.detected && f.evidence ? escapeHtml(f.evidence) : ''}
            </span>
          </div>
        `).join('')}
      </div>
      ${data.engagementScore.suggestions.length > 0 ? `
        <div style="border-top:1px solid ${data.engagementScore.level === 'high' ? '#86efac' : data.engagementScore.level === 'medium' ? '#fde047' : '#fca5a5'};padding-top:10px;">
          <div style="font-weight:600;font-size:12px;margin-bottom:6px;">참고 제안:</div>
          <ul style="margin:0;padding-left:16px;font-size:11px;color:#374151;">
            ${data.engagementScore.suggestions.map(s => `<li style="margin-bottom:4px;">${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  </div>
  ` : ''}

  <div class="footer">
    <div>Generated by Smart Safety Guardian (스마트 안전지킴이)</div>
    <div style="margin-top:5px;">Luna Team - GNU RISE AI+X Competition 2026</div>
    <div style="margin-top:5px; font-size:10px;">
      검증 단계: 형식검증 - 논리검증 - 교차분석 - 패턴감지 - 맥락분석
      ${data.crossValidation ? ' - 사진교차검증' : ''}
    </div>
  </div>
</body>
</html>
`;
}

export async function POST(req: Request) {
  try {
    const data: ExportData = await req.json();

    console.log("[API Export PDF] Received request:", {
      fileName: data.fileName,
      documentType: data.documentType,
      tbmSummaryLen: (data.tbmSummary || "").length,
      tbmTranscriptLen: (data.tbmTranscript || "").length,
      issuesCount: Array.isArray(data.issues) ? data.issues.length : 0,
    });

    // ✅ Detailed TBM logging
    if (data.tbmSummary && data.tbmSummary.length > 0) {
      console.log("[API Export PDF] TBM Summary present:", data.tbmSummary.substring(0, 200) + "...");
    } else {
      console.log("[API Export PDF] ⚠️ TBM Summary is EMPTY or missing");
    }

    if (!data.fileName || !data.summary || !data.createdAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const htmlContent = buildHTMLContent(data);

    console.log("[API Export PDF] Launching Chromium...");
    const isLocal = process.env.NODE_ENV === "development";
    const browser = await puppeteer.launch({
      args: isLocal ? [] : chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: isLocal
        ? (process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
        : await chromium.executablePath(),
      headless: true,
    });

    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      pdfBuffer = Buffer.from(await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
        preferCSSPageSize: true,
      }));
    } finally {
      await browser.close();
    }

    console.log("[API Export PDF] PDF generated successfully, size:", pdfBuffer.length);

    // Use project name when in project context, otherwise fall back to file name
    const baseName = data.projectName ? data.projectName : data.fileName;

    const datePattern = /^\d{4}-\d{2}-\d{2}_/;
    let finalFilename: string;

    if (datePattern.test(baseName)) {
      const cleanFileName = baseName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
      finalFilename = `${cleanFileName}_report.pdf`;
    } else {
      const dateStr = new Date(data.createdAt).toISOString().split("T")[0];
      const cleanFileName = baseName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
      finalFilename = `${dateStr}_${cleanFileName}_report.pdf`;
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(finalFilename)}"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("[API Export PDF] Error:", error);
    return NextResponse.json({ error: `PDF generation failed: ${error.message}` }, { status: 500 });
  }
}
