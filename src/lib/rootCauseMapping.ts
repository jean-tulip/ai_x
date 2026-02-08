/**
 * Root Cause Mapping based on Korean construction safety research
 *
 * This module links validation rules to research-identified root causes,
 * enabling evidence-based analysis and cross-source synthesis.
 *
 * References:
 * - Kim & Chi (2020). "Analysis of Fatal Accidents in Korean Construction." Sustainability, 12(8), 3120.
 * - Hwang et al. (2023). "Critical Factors in Small-Scale Construction Sites." Buildings, 13(10), 2472.
 */

export type RootCauseId = "RC01" | "RC02" | "RC03" | "RC04" | "RC05" | "RC06" | "RC07";

export interface RootCause {
  id: RootCauseId;
  nameKo: string;
  nameEn: string;
  description: string;
  reference: string;
}

export const ROOT_CAUSES: Record<RootCauseId, RootCause> = {
  RC01: {
    id: "RC01",
    nameKo: "교육 부족",
    nameEn: "Lack of proper training",
    description: "Workers or managers not adequately trained on safety procedures",
    reference: "Kim & Chi (2020), Hwang et al. (2023)"
  },
  RC02: {
    id: "RC02",
    nameKo: "보호구 미제공",
    nameEn: "Safety equipment not provided",
    description: "Required PPE or safety devices not available at the worksite",
    reference: "Kim & Chi (2020)"
  },
  RC03: {
    id: "RC03",
    nameKo: "안전조치 미이행",
    nameEn: "Deficient enforcement of safety measures",
    description: "Safety measures exist on paper but are not enforced in practice",
    reference: "Kim & Chi (2020), Hwang et al. (2023)"
  },
  RC04: {
    id: "RC04",
    nameKo: "불안전한 상태",
    nameEn: "Unsafe conditions",
    description: "Equipment, method, or environmental conditions are unsafe",
    reference: "Kim & Chi (2020)"
  },
  RC05: {
    id: "RC05",
    nameKo: "안전 불감증",
    nameEn: "Poor attitude to safety",
    description: "Complacency, rushing, or willful disregard for safety rules",
    reference: "Kim & Chi (2020)"
  },
  RC06: {
    id: "RC06",
    nameKo: "절차 이탈",
    nameEn: "Isolated deviation from procedures",
    description: "One-off departure from prescribed safe behavior",
    reference: "Kim & Chi (2020)"
  },
  RC07: {
    id: "RC07",
    nameKo: "안전계획 부재",
    nameEn: "Lack of safety management plan",
    description: "No systematic safety planning for the work being performed",
    reference: "Kim & Chi (2020)"
  }
};

/**
 * Rule-to-Root-Cause Mapping
 *
 * Why a static map instead of AI classification?
 * - Deterministic: same rule always maps to same root cause (testable)
 * - Fast: no API call needed, runs in <1ms
 * - The AI reasoning happens in synthesis (Part B), not here
 *
 * This map connects our validator rules to research root causes.
 * Multiple rules can share a root cause. One rule maps to ONE primary root cause.
 */
export const RULE_TO_ROOT_CAUSE: Record<string, RootCauseId> = {
  // Safety violations → mostly RC02 (equipment) or RC03 (enforcement)
  "rule_height_harness": "RC02",        // No harness = equipment not provided
  "rule_height_no_net": "RC02",         // No safety net = equipment not provided
  "rule_fire_extinguisher": "RC02",     // No fire extinguisher = equipment not provided
  "rule_confined_ventilation": "RC02",  // No ventilation = equipment not provided

  // Logical contradictions → RC03 (enforcement gap between paper and practice)
  "rule_fall_contradiction": "RC03",
  "rule_fire_contradiction": "RC03",
  "rule_confined_space_contradiction": "RC03",
  "rule_excavation_contradiction": "RC03",
  "rule_electrical_contradiction": "RC03",

  // Missing fields → RC07 (no safety management plan)
  "rule_missing_date": "RC07",
  "rule_missing_inspector": "RC07",
  "completeness_too_short": "RC07",
  "completeness_no_checklist": "RC07",

  // Suspicious patterns → RC05 (poor attitude / complacency)
  "pattern_all_checked": "RC05",
  "pattern_all_na": "RC05",
  "rule_excessive_na": "RC05",
  "pattern_copy_paste": "RC05",
  "pattern_rapid_completion": "RC05",

  // Signature issues → RC03 (enforcement)
  "rule_missing_signature_worker": "RC03",
  "rule_missing_signature_manager": "RC03",

  // TBM-related issues
  "tbm_incomplete": "RC01",             // Incomplete TBM = training issue
  "tbm_missing_hazards": "RC01",        // Missing hazard discussion = training
  "tbm_mismatch": "RC03",               // TBM doesn't match document = enforcement

  // Cross-document issues
  "cross_doc_inconsistency": "RC03",    // Inconsistent across docs = enforcement
  "cross_doc_timeline_gap": "RC06",     // Timeline gaps = deviation

  // Risk matrix issues
  "risk_matrix_mismatch": "RC03",       // Risk level mismatch = enforcement
  "risk_matrix_critical_factors": "RC04", // High-risk factors = unsafe conditions
};

/**
 * Get root cause for a validation issue
 * Returns null if no mapping exists (new/unknown rules)
 */
export function getRootCause(ruleId: string | undefined): RootCause | null {
  if (!ruleId) return null;
  const rootCauseId = RULE_TO_ROOT_CAUSE[ruleId];
  if (!rootCauseId) return null;
  return ROOT_CAUSES[rootCauseId];
}

/**
 * Aggregate root causes from a list of issues
 * Used for synthesis context and PDF export summary
 */
export function aggregateRootCauses(issues: Array<{ ruleId?: string }>): {
  counts: Record<RootCauseId, number>;
  primary: RootCause | null;  // Most frequent root cause
  summary: string;            // Korean-language summary for synthesis
} {
  const counts: Partial<Record<RootCauseId, number>> = {};

  for (const issue of issues) {
    const rc = getRootCause(issue.ruleId);
    if (rc) {
      counts[rc.id] = (counts[rc.id] || 0) + 1;
    }
  }

  // Find primary (most frequent) root cause
  let primaryId: RootCauseId | null = null;
  let maxCount = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      primaryId = id as RootCauseId;
    }
  }

  const primary = primaryId ? ROOT_CAUSES[primaryId] : null;

  // Build Korean summary for synthesis prompt
  const summaryParts: string[] = [];
  for (const [id, count] of Object.entries(counts)) {
    const rc = ROOT_CAUSES[id as RootCauseId];
    summaryParts.push(`${rc.nameKo}(${rc.id}): ${count}건`);
  }
  const summary = summaryParts.length > 0
    ? `근본 원인 분석: ${summaryParts.join(", ")}`
    : "근본 원인: 분류 가능한 이슈 없음";

  return {
    counts: counts as Record<RootCauseId, number>,
    primary,
    summary
  };
}
