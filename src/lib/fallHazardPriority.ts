/**
 * Fall Hazard Priority System
 *
 * [KEY DESIGN DECISION] Why a dedicated module instead of just changing severity?
 *
 * Fall detection needs to work ACROSS sources, not just within one.
 * A dedicated module provides a single source of truth for "is height work happening?"
 * that any component (validator, TBM cross-validation, photo analysis, synthesis) can query.
 *
 * References:
 * - Hwang et al. (2023): Falls = 71% of fatal accidents
 * - Kim & Chi (2020): Scaffolding = #1 accident cause
 */

// [BOILERPLATE] Height work detection keywords
export const HEIGHT_WORK_INDICATORS = {
  // Korean terms for height/fall related work
  korean: [
    "고소작업", "고소 작업",    // Height work
    "비계", "비계작업",          // Scaffolding
    "추락", "추락방지",          // Fall / fall prevention
    "안전대", "안전벨트",        // Safety harness / belt
    "사다리",                    // Ladder
    "지붕", "지붕작업",          // Roof work
    "철골", "철골작업",          // Steel frame work
    "개구부",                    // Openings
    "단부",                      // Edges
    "작업발판",                  // Work platform
    "안전난간",                  // Safety railing
    "수직보호망",                // Vertical safety net
    "안전방망",                  // Safety net
    "달비계",                    // Hanging scaffold
    "이동식비계",                // Mobile scaffold
  ],
  // English terms (for bilingual TBM recordings)
  english: [
    "height work", "work at height",
    "scaffolding", "scaffold",
    "fall protection", "fall prevention",
    "harness", "safety belt",
    "ladder", "roof work",
    "steel erection", "opening", "edge",
  ]
};

/**
 * [KEY DESIGN DECISION] Source-agnostic height work detection
 *
 * This function takes any text (document content, TBM transcript,
 * photo analysis output) and determines if height work is indicated.
 *
 * Returns a confidence level rather than boolean because some indicators
 * are stronger than others (e.g., "비계작업" is definitive, "사다리" could be
 * for low-height access).
 */
export interface HeightWorkDetection {
  detected: boolean;
  confidence: "high" | "medium" | "low";
  indicators: string[];       // Which keywords were found
  source: "document" | "tbm" | "photo" | "unknown";
}

export function detectHeightWork(
  text: string,
  source: HeightWorkDetection["source"] = "unknown"
): HeightWorkDetection {
  const textLower = text.toLowerCase();
  const foundIndicators: string[] = [];

  // Check Korean indicators
  for (const keyword of HEIGHT_WORK_INDICATORS.korean) {
    if (text.includes(keyword)) {
      foundIndicators.push(keyword);
    }
  }

  // Check English indicators
  for (const keyword of HEIGHT_WORK_INDICATORS.english) {
    if (textLower.includes(keyword)) {
      foundIndicators.push(keyword);
    }
  }

  // Determine confidence based on indicator strength
  const highConfidenceTerms = ["고소작업", "비계", "비계작업", "추락방지", "scaffolding", "work at height"];
  const hasHighConfidence = foundIndicators.some(i => highConfidenceTerms.includes(i));

  let confidence: HeightWorkDetection["confidence"] = "low";
  if (hasHighConfidence || foundIndicators.length >= 3) {
    confidence = "high";
  } else if (foundIndicators.length >= 1) {
    confidence = "medium";
  }

  return {
    detected: foundIndicators.length > 0,
    confidence,
    indicators: foundIndicators,
    source,
  };
}

/**
 * [KEY DESIGN DECISION] Cross-source height work aggregation
 *
 * This is the synthesis connection. It takes detection results from
 * ALL available sources and determines the overall height work status.
 *
 * Rule: If ANY source detects height work with medium+ confidence,
 * the entire analysis should escalate fall hazard scrutiny.
 */
export interface CrossSourceFallStatus {
  heightWorkDetected: boolean;
  overallConfidence: "high" | "medium" | "low" | "none";
  sources: HeightWorkDetection[];
  escalationRequired: boolean;
  escalationReason: string;  // Korean explanation for synthesis prompt
}

export function aggregateFallStatus(
  detections: HeightWorkDetection[]
): CrossSourceFallStatus {
  const activeDetections = detections.filter(d => d.detected);

  if (activeDetections.length === 0) {
    return {
      heightWorkDetected: false,
      overallConfidence: "none",
      sources: detections,
      escalationRequired: false,
      escalationReason: "",
    };
  }

  // Multiple sources confirming = higher confidence
  const multiSourceConfirmed = activeDetections.length >= 2;
  const anyHighConfidence = activeDetections.some(d => d.confidence === "high");

  const overallConfidence: CrossSourceFallStatus["overallConfidence"] =
    (anyHighConfidence || multiSourceConfirmed) ? "high" : "medium";

  // Build Korean explanation for the synthesis prompt
  const sourceNames = activeDetections.map(d => {
    switch (d.source) {
      case "document": return "안전 점검표";
      case "tbm": return "TBM 기록";
      case "photo": return "현장 사진";
      default: return "기타";
    }
  });

  const escalationReason = `고소작업 감지됨 (${sourceNames.join(", ")}에서 확인). `
    + `연구에 따르면 추락사고는 건설업 사망사고의 71%를 차지합니다. `
    + `모든 추락 관련 이슈를 최우선으로 확인하세요.`;

  return {
    heightWorkDetected: true,
    overallConfidence,
    sources: detections,
    escalationRequired: true,
    escalationReason,
  };
}

/**
 * Fall-related rule IDs for severity escalation
 */
export const FALL_RELATED_RULES = [
  "rule_height_harness",
  "rule_height_no_net",
  "rule_fall_contradiction",
  "rule_height_work_missing",
];
