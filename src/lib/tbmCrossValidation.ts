/**
 * TBM Cross-Validation Module
 *
 * Validates safety documents against TBM (Toolbox Meeting) context.
 * Detects inconsistencies between what was discussed in TBM and what's checked in documents.
 *
 * Enhanced with AI-powered reasoning for deeper analysis.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { detectHeightWork } from "./fallHazardPriority";

export interface TBMContext {
  workType: string | null;
  extractedHazards: string[];
  extractedInspector: string | null;
  summary: string;
  participants?: string[];
  completenessScore?: {
    score: number;
    level: string;
    missingTopics?: string[];
    suggestions?: string[];
  };
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
}

export interface ChecklistItem {
  id?: string;
  category?: string;
  item?: string;
  nameKo?: string;
  value?: string;
  checked?: boolean;
}

export interface DocData {
  inspectorName?: string;
  checklist?: ChecklistItem[];
  fields?: {
    점검일자?: string | null;
    현장명?: string | null;
    작업내용?: string | null;
    작업인원?: string | null;
  };
  [key: string]: any;
}

export interface ValidationIssue {
  id: string;
  severity: "error" | "warn" | "info";
  title: string;
  message: string;
  ruleId: string;
}

// ============================================================================
// AI Cross-Validation Types
// ============================================================================

export interface TBMAICrossValidationInput {
  tbmContext: TBMContext;
  docData: DocData;
}

export interface TBMCrossValidationResult {
  inconsistencies: Array<{
    type: "hazard_not_checked" | "hazard_missing_item" | "inspector_mismatch" | "work_type_mismatch" | "general";
    severity: "error" | "warn" | "info";
    hazard?: string;
    checklistItem?: string;
    reason: string;
    suggestion?: string;
  }>;
  confidence: number;
  summary: string;
}

// ============================================================================
// AI Cross-Validation Functions
// ============================================================================

function buildTBMCrossValidationPrompt(input: TBMAICrossValidationInput): string {
  const { tbmContext, docData } = input;

  const checklistStr = docData.checklist?.map(item => {
    const name = item.nameKo || item.item || item.id || "unknown";
    const value = item.value || (item.checked ? "✔" : "✖");
    return `- ${name}: ${value}`;
  }).join("\n") || "체크리스트 없음";

  // [Brief #2] Detect height work in TBM content for fall hazard prioritization
  const tbmText = (tbmContext.summary || "") + " " + (tbmContext.extractedHazards?.join(" ") || "") + " " + (tbmContext.workType || "");
  const heightInTBM = detectHeightWork(tbmText, "tbm");

  let prompt = `
너는 산업 안전 문서 검증 전문가다. TBM(작업 전 안전 회의)에서 논의된 내용과 안전 점검표의 일관성을 분석하라.

## TBM 정보
- 작업 유형: ${tbmContext.workType || "미확인"}
- 논의된 위험요인: ${tbmContext.extractedHazards?.join(", ") || "없음"}
- 담당자: ${tbmContext.extractedInspector || "미확인"}
- 참석자: ${tbmContext.participants?.join(", ") || "미확인"}

## TBM 요약
${tbmContext.summary || "요약 없음"}

## 점검표 정보
- 점검자: ${docData.inspectorName || "미확인"}
- 작업 내용: ${docData.fields?.작업내용 || "미확인"}

## 체크리스트
${checklistStr}

## 분석 과제
1. TBM에서 논의된 위험요인이 점검표에서 적절히 확인되었는지 분석
2. TBM 담당자와 점검표 점검자 일치 여부 확인
3. 작업 유형과 점검 항목의 일관성 확인
4. 중요한 불일치 사항 식별

## 출력 형식 (JSON만 출력, 설명/마크다운 금지)
{
  "inconsistencies": [
    {
      "type": "hazard_not_checked" | "hazard_missing_item" | "inspector_mismatch" | "work_type_mismatch" | "general",
      "severity": "error" | "warn" | "info",
      "hazard": "관련 위험요인 (해당되는 경우)",
      "checklistItem": "관련 체크리스트 항목 (해당되는 경우)",
      "reason": "불일치 이유 (구체적으로)",
      "suggestion": "개선 제안"
    }
  ],
  "confidence": 0-100,
  "summary": "전체 분석 요약 (1-2문장)"
}

주의:
- 비판단적 어조 사용 ("위험하다" 대신 "불일치가 존재함")
- 확인된 사실만 언급, 추측은 "추정" 표시
- inconsistencies가 없으면 빈 배열 반환`;

  // [Brief #2] Add fall hazard priority instructions when height work is detected
  if (heightInTBM.detected) {
    prompt += `

[추락 위험 우선순위 - 중요]
TBM에서 고소작업 관련 내용이 감지되었습니다 (키워드: ${heightInTBM.indicators.join(", ")}).
연구에 따르면 추락사고는 건설업 사망사고의 71%를 차지합니다.
다음 항목을 반드시 확인하고, 미흡 시 severity를 "error"로 설정하세요:
- 안전대/안전벨트 착용 논의 여부
- 추락방호장치 설치 확인 여부
- 비계/발판 안전 점검 언급 여부
- 개구부/단부 방호 조치 논의 여부`;
  }

  return prompt.trim();
}

/**
 * AI-powered TBM cross-validation using Claude Sonnet 4.5 with GPT-5.1 fallback
 */
export async function aiCrossValidateTBM(
  input: TBMAICrossValidationInput,
  options?: {
    anthropicClient?: Anthropic;
    openaiClient?: OpenAI;
  }
): Promise<TBMCrossValidationResult> {
  const prompt = buildTBMCrossValidationPrompt(input);

  // Try Claude first
  if (options?.anthropicClient || process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = options?.anthropicClient || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      });

      const text = response.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");

      const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim());
      return parsed as TBMCrossValidationResult;
    } catch (e) {
      console.warn("[TBM AI Cross-Validation] Claude failed, trying GPT-5.1:", e);
    }
  }

  // Fallback to GPT-5.1
  if (options?.openaiClient || process.env.OPENAI_API_KEY) {
    const openai = options?.openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const text = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    return parsed as TBMCrossValidationResult;
  }

  throw new Error("No AI client available for TBM cross-validation");
}

/**
 * Convert AI cross-validation result to validation issues
 */
export function tbmCrossValidationToIssues(result: TBMCrossValidationResult): ValidationIssue[] {
  return result.inconsistencies.map((inc, idx) => {
    let ruleId = "tbm_cross_";
    switch (inc.type) {
      case "hazard_not_checked":
        ruleId += "hazard_not_checked";
        break;
      case "hazard_missing_item":
        ruleId += "hazard_missing_item";
        break;
      case "inspector_mismatch":
        ruleId += "inspector_mismatch";
        break;
      case "work_type_mismatch":
        ruleId += "work_type_mismatch";
        break;
      default:
        ruleId += "general";
    }

    let title = "TBM-점검표 불일치";
    if (inc.hazard) {
      title = `TBM-점검표 불일치: ${inc.hazard}`;
    } else if (inc.type === "inspector_mismatch") {
      title = "TBM-점검표 담당자 불일치";
    }

    let message = inc.reason;
    if (inc.suggestion) {
      message += `\n\n권장 조치: ${inc.suggestion}`;
    }

    return {
      id: `tbm_ai_${idx}`,
      severity: inc.severity,
      title,
      message,
      ruleId,
    };
  });
}

// ============================================================================
// Legacy Keyword-Based Validation (Fallback)
// ============================================================================

/**
 * Legacy validation function (keyword-based)
 * Kept as fallback when AI validation fails
 */
export function validateAgainstTBMLegacy(
  docData: DocData,
  tbmContext: TBMContext
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!tbmContext || !tbmContext.extractedHazards || tbmContext.extractedHazards.length === 0) {
    return issues; // No TBM context to validate against
  }

  const checklist = docData.checklist || [];
  const hazards = tbmContext.extractedHazards.map(h => h.toLowerCase());

  // Rule 1: Fall Hazard - TBM mentions but no fall protection items
  if (hazards.some(h => h.includes("추락") || h.includes("비계") || h.includes("높은 곳"))) {
    const fallItems = checklist.filter(item => {
      const id = (item.id || "").toLowerCase();
      const category = (item.category || "").toLowerCase();
      const itemText = (item.item || item.nameKo || "").toLowerCase();
      return (
        id.includes("fall") ||
        id.includes("height") ||
        category.includes("추락") ||
        category.includes("고소") ||
        itemText.includes("추락") ||
        itemText.includes("안전대") ||
        itemText.includes("난간")
      );
    });

    if (fallItems.length === 0) {
      issues.push({
        id: "cross_tbm_fall_missing",
        severity: "warn",
        title: "TBM-체크리스트 불일치: 추락 위험",
        message: `TBM에서 추락 위험을 논의했으나 체크리스트에 관련 항목이 없습니다. 고소작업 안전대착용, 추락방호망, 안전난간 등의 항목을 확인하세요.`,
        ruleId: "cross_tbm_fall_missing",
      });
    } else {
      // Check if fall items are checked
      const uncheckedFallItems = fallItems.filter(item => {
        const val = (item.value || "").trim();
        return val !== "✔" && val !== "O" && val !== "o" && !item.checked;
      });

      if (uncheckedFallItems.length > 0) {
        issues.push({
          id: "cross_tbm_fall_unchecked",
          severity: "warn",
          title: "TBM-체크리스트 불일치: 추락 안전조치 미체크",
          message: `TBM에서 추락 위험을 논의했으나 체크리스트의 추락 관련 항목이 체크되지 않았습니다. (미체크 항목: ${uncheckedFallItems.length}개)`,
          ruleId: "cross_tbm_fall_unchecked",
        });
      }
    }
  }

  // Rule 2: Fire Hazard - TBM mentions but no fire safety items
  if (hazards.some(h => h.includes("화재") || h.includes("용접") || h.includes("불꽃") || h.includes("가연성"))) {
    const fireItems = checklist.filter(item => {
      const id = (item.id || "").toLowerCase();
      const category = (item.category || "").toLowerCase();
      const itemText = (item.item || item.nameKo || "").toLowerCase();
      return (
        id.includes("fire") ||
        category.includes("화재") ||
        category.includes("용접") ||
        itemText.includes("화재") ||
        itemText.includes("소화기") ||
        itemText.includes("용접")
      );
    });

    if (fireItems.length === 0) {
      issues.push({
        id: "cross_tbm_fire_missing",
        severity: "warn",
        title: "TBM-체크리스트 불일치: 화재 위험",
        message: `TBM에서 화재/용접 위험을 논의했으나 체크리스트에 관련 항목이 없습니다. 소화기 비치, 화기작업 허가, 용접 안전조치 등을 확인하세요.`,
        ruleId: "cross_tbm_fire_missing",
      });
    } else {
      const uncheckedFireItems = fireItems.filter(item => {
        const val = (item.value || "").trim();
        return val !== "✔" && val !== "O" && val !== "o" && !item.checked;
      });

      if (uncheckedFireItems.length > 0) {
        issues.push({
          id: "cross_tbm_fire_unchecked",
          severity: "warn",
          title: "TBM-체크리스트 불일치: 화재 안전조치 미체크",
          message: `TBM에서 화재 위험을 논의했으나 체크리스트의 화재 관련 항목이 체크되지 않았습니다. (미체크 항목: ${uncheckedFireItems.length}개)`,
          ruleId: "cross_tbm_fire_unchecked",
        });
      }
    }
  }

  // Rule 3: Electrical Hazard - TBM mentions but no electrical safety items
  if (hazards.some(h => h.includes("감전") || h.includes("전기") || h.includes("누전"))) {
    const electricalItems = checklist.filter(item => {
      const id = (item.id || "").toLowerCase();
      const category = (item.category || "").toLowerCase();
      const itemText = (item.item || item.nameKo || "").toLowerCase();
      return (
        id.includes("electrical") ||
        id.includes("electric") ||
        category.includes("전기") ||
        category.includes("감전") ||
        itemText.includes("전기") ||
        itemText.includes("감전") ||
        itemText.includes("누전")
      );
    });

    if (electricalItems.length === 0) {
      issues.push({
        id: "cross_tbm_electrical_missing",
        severity: "warn",
        title: "TBM-체크리스트 불일치: 감전 위험",
        message: `TBM에서 감전/전기 위험을 논의했으나 체크리스트에 관련 항목이 없습니다. 누전차단기, 절연보호구, 전기작업 안전조치 등을 확인하세요.`,
        ruleId: "cross_tbm_electrical_missing",
      });
    } else {
      const uncheckedElectricalItems = electricalItems.filter(item => {
        const val = (item.value || "").trim();
        return val !== "✔" && val !== "O" && val !== "o" && !item.checked;
      });

      if (uncheckedElectricalItems.length > 0) {
        issues.push({
          id: "cross_tbm_electrical_unchecked",
          severity: "warn",
          title: "TBM-체크리스트 불일치: 감전 안전조치 미체크",
          message: `TBM에서 감전 위험을 논의했으나 체크리스트의 전기 관련 항목이 체크되지 않았습니다. (미체크 항목: ${uncheckedElectricalItems.length}개)`,
          ruleId: "cross_tbm_electrical_unchecked",
        });
      }
    }
  }

  // Rule 4: Confined Space - TBM mentions but no confined space items
  if (hazards.some(h => h.includes("밀폐") || h.includes("질식") || h.includes("환기"))) {
    const confinedItems = checklist.filter(item => {
      const id = (item.id || "").toLowerCase();
      const category = (item.category || "").toLowerCase();
      const itemText = (item.item || item.nameKo || "").toLowerCase();
      return (
        id.includes("confined") ||
        id.includes("ventilation") ||
        category.includes("밀폐") ||
        category.includes("환기") ||
        itemText.includes("밀폐") ||
        itemText.includes("환기") ||
        itemText.includes("산소")
      );
    });

    if (confinedItems.length === 0) {
      issues.push({
        id: "cross_tbm_confined_missing",
        severity: "warn",
        title: "TBM-체크리스트 불일치: 밀폐공간 위험",
        message: `TBM에서 밀폐공간/환기 위험을 논의했으나 체크리스트에 관련 항목이 없습니다. 산소농도 측정, 환기장치, 출입허가 등을 확인하세요.`,
        ruleId: "cross_tbm_confined_missing",
      });
    } else {
      const uncheckedConfinedItems = confinedItems.filter(item => {
        const val = (item.value || "").trim();
        return val !== "✔" && val !== "O" && val !== "o" && !item.checked;
      });

      if (uncheckedConfinedItems.length > 0) {
        issues.push({
          id: "cross_tbm_confined_unchecked",
          severity: "warn",
          title: "TBM-체크리스트 불일치: 밀폐공간 안전조치 미체크",
          message: `TBM에서 밀폐공간 위험을 논의했으나 체크리스트의 관련 항목이 체크되지 않았습니다. (미체크 항목: ${uncheckedConfinedItems.length}개)`,
          ruleId: "cross_tbm_confined_unchecked",
        });
      }
    }
  }

  // Rule 5: Inspector Mismatch - TBM inspector differs from document inspector
  if (tbmContext.extractedInspector && docData.inspectorName) {
    const tbmInspector = tbmContext.extractedInspector.trim();
    const docInspector = docData.inspectorName.trim();

    // Simple name comparison (not strict, as names might be formatted differently)
    if (tbmInspector && docInspector && !docInspector.includes(tbmInspector) && !tbmInspector.includes(docInspector)) {
      issues.push({
        id: "cross_tbm_inspector_mismatch",
        severity: "info",
        title: "TBM-체크리스트 담당자 불일치",
        message: `TBM 담당자(${tbmInspector})와 문서 점검자(${docInspector})가 다릅니다. 담당자 변경이 있었는지 확인하세요.`,
        ruleId: "cross_tbm_inspector_mismatch",
      });
    }
  }

  return issues;
}

// ============================================================================
// Main Export - Uses AI with Legacy Fallback
// ============================================================================

/**
 * Main validation function - uses AI cross-validation with legacy fallback
 */
export async function validateAgainstTBM(
  docData: DocData,
  tbmContext: TBMContext,
  options?: {
    useAI?: boolean;
    anthropicClient?: Anthropic;
    openaiClient?: OpenAI;
  }
): Promise<ValidationIssue[]> {
  // If AI is explicitly disabled, use legacy
  if (options?.useAI === false) {
    return validateAgainstTBMLegacy(docData, tbmContext);
  }

  // Try AI validation first
  try {
    console.log("[TBM Cross-Validation] Attempting AI-powered validation...");
    const result = await aiCrossValidateTBM(
      { tbmContext, docData },
      {
        anthropicClient: options?.anthropicClient,
        openaiClient: options?.openaiClient,
      }
    );
    console.log(`[TBM Cross-Validation] AI found ${result.inconsistencies.length} inconsistencies (confidence: ${result.confidence}%)`);
    return tbmCrossValidationToIssues(result);
  } catch (e) {
    console.warn("[TBM Cross-Validation] AI validation failed, using legacy:", e);
    return validateAgainstTBMLegacy(docData, tbmContext);
  }
}
