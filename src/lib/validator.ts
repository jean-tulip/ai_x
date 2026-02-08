/**
 * validator.ts - Safety Document Validation Engine
 *
 * This module implements a comprehensive 5-stage validation framework
 * for Korean construction safety documents.
 *
 * @module validator
 * @version 2.0.0 (Enhanced Stage 2)
 *
 * VALIDATION STAGES:
 * ==================
 * Stage 1: Format Validation ✅
 *   - Required fields present (date, site name, work description)
 *   - Signatures present (worker, supervisor)
 *   - Basic completeness checks
 *
 * Stage 2: Intra-Checklist Logic ✅ (ENHANCED)
 *   - IF-THEN consistency within single document
 *   - Safety violation detection (25+ rules)
 *   - Logical contradiction detection
 *   - N/A pattern analysis
 *   - Completeness validation
 *   Categories: safety_violation, logical_contradiction,
 *               completeness, suspicious_pattern
 *
 * Stage 3: Cross-Document Consistency (See route.ts)
 *   - Multiple documents about same work tell same story
 *   - Risk level consistency across documents
 *   - AI-powered context checking
 *
 * Stage 4: Behavioral Pattern Analysis (See patternAnalysis.ts)
 *   - "Always ✔" detection
 *   - Copy-paste behavior detection
 *   - Inspector-specific patterns
 *
 * Stage 5: Risk Signal Guidance (See route.ts)
 *   - Non-judgmental alert formatting
 *   - Actionable recommendations
 *   - Korean safety standard references
 *
 * RULE STRUCTURE (Enhanced):
 * ==========================
 * Each rule includes:
 * - id: Unique identifier (e.g., "rule_height_harness")
 * - category: Rule type (safety_violation, logical_contradiction, etc.)
 * - descriptionKo: Korean description
 * - descriptionEn: English description (for documentation)
 * - guidance: Actionable recommendation
 * - reference: Korean safety law reference (KOSHA, MOEL)
 * - severity: error | warn | info
 * - check: Validation function
 *
 * KOREAN SAFETY STANDARDS REFERENCED:
 * ====================================
 * - 산업안전보건법 (Occupational Safety and Health Act)
 * - 산업안전보건기준에 관한 규칙 (OSHSR - Detailed Regulations)
 * - KOSHA GUIDE (Korea Occupational Safety and Health Agency Guidelines)
 *
 * @see CLAUDE.md for project context
 * @see testData.ts for test cases
 */

// ============================================================
// Stage 2-5: Extended Types for Full Validation Framework
// ============================================================

export type ChecklistValue = "✔" | "✖" | "N/A" | null;

export interface ChecklistItem {
  id: string;
  category: string;
  nameKo: string;
  value: ChecklistValue;
}

export interface DocData {
  docType: "산업안전 점검표" | "위험성 평가 보고서" | "작업 전 안전점검표" | "TBM" | "unknown";
  fields: {
    점검일자: string | null;
    현장명: string | null;
    작업내용: string | null;
    작업인원: string | null;
    // Weather data (optional)
    풍속?: string;
    기온?: string;
    강우량?: string;
  };
  signature: {
    담당: "present" | "missing" | "unknown";
    소장: "present" | "missing" | "unknown";
  };
  // Stage 2: Checklist items for intra-document logic
  checklist?: ChecklistItem[];
  // Stage 3: Risk level for cross-document consistency
  riskLevel?: "high" | "medium" | "low";
  // Stage 4: Inspector name for pattern analysis
  inspectorName?: string;
}

export type Severity = "error" | "warn" | "info";

export interface ValidationIssue {
  severity: Severity;
  title: string;
  message: string;
  ruleId?: string; // Stage 2: Link to specific rule that triggered this issue
  confidence?: number; // Stage 4: Confidence score (0-100)
  score?: number; // Stage 4: Severity score
  isAIFixable?: boolean; // Whether AI can suggest a fix (false for signatures, photos, physical inspections)
  path?: string; // Path to specific field or section
  rootCause?: {  // Research-backed root cause classification
    id: string;
    nameKo: string;
    nameEn: string;
  } | null;
}

export type Issue = ValidationIssue & { id?: string };

// ============================================================
// Stage 2: IF-THEN Consistency Rules (Enhanced)
// ============================================================

/**
 * Rule Categories for better organization and reporting
 */
export type RuleCategory =
  | "safety_violation"      // Direct safety requirement not met
  | "logical_contradiction" // Inconsistent checklist values
  | "completeness"          // Missing required items
  | "suspicious_pattern";   // N/A or unusual patterns in critical items

/**
 * Enhanced rule structure with metadata and guidance
 */
interface ConsistencyRule {
  id: string;
  category: RuleCategory;
  descriptionKo: string;
  descriptionEn: string;
  guidance: string; // Actionable recommendation
  reference?: string; // Korean safety standard reference
  severity: Severity;
  // Returns true if violation detected
  check: (checklist: ChecklistItem[]) => boolean;
}

/**
 * Critical safety items that should not be marked N/A or null
 * Based on KOSHA guidelines for high-risk work activities
 */
const CRITICAL_SAFETY_ITEMS = [
  "fall_01",  // 고소작업
  "fire_01",  // 화기작업
  "conf_01",  // 밀폐공간작업
  "exc_01",   // 굴착작업
  "elec_02",  // 전기작업
];

/**
 * Required checklist items that should exist in all safety documents
 */
const REQUIRED_CHECKLIST_ITEMS = [
  { id: "ppe_01", nameKo: "안전모착용" },
  { id: "fall_01", nameKo: "고소작업" },
];

/**
 * Comprehensive Stage 2 validation rules
 * Organized by category for maintainability
 */
const CONSISTENCY_RULES: ConsistencyRule[] = [
  // ========================================
  // Category: Safety Violations
  // ========================================
  {
    id: "rule_height_harness",
    category: "safety_violation",
    descriptionKo: "고소작업 시 안전대 착용 필수",
    descriptionEn: "Safety harness required for work at height",
    guidance: "산업안전보건기준에 관한 규칙 제42조: 2m 이상 고소작업 시 안전대 착용 의무",
    reference: "산업안전보건법 시행규칙 제42조",
    severity: "error",
    check: (checklist) => {
      const heightWork = checklist.find((c) => c.id === "fall_01");
      const harness = checklist.find((c) => c.id === "ppe_03");
      return heightWork?.value === "✔" && harness?.value === "✖";
    },
  },
  {
    id: "rule_fire_extinguisher",
    category: "safety_violation",
    descriptionKo: "화기작업 시 소화기 비치 필수",
    descriptionEn: "Fire extinguisher required for hot work",
    guidance: "화기작업 시 반경 10m 이내 소화기 비치 및 감시자 배치",
    reference: "산업안전보건기준에 관한 규칙 제241조",
    severity: "error",
    check: (checklist) => {
      const hotWork = checklist.find((c) => c.id === "fire_01");
      const extinguisher = checklist.find((c) => c.id === "fire_02");
      return hotWork?.value === "✔" && extinguisher?.value === "✖";
    },
  },
  {
    id: "rule_confined_oxygen",
    category: "safety_violation",
    descriptionKo: "밀폐공간 작업 시 산소농도 측정 필수",
    descriptionEn: "Oxygen level measurement required for confined space entry",
    guidance: "작업 전 산소농도 18% 이상 확인 필수 (KOSHA GUIDE)",
    reference: "산업안전보건기준에 관한 규칙 제619조",
    severity: "error",
    check: (checklist) => {
      const confined = checklist.find((c) => c.id === "conf_01");
      const oxygen = checklist.find((c) => c.id === "conf_02");
      return confined?.value === "✔" && oxygen?.value === "✖";
    },
  },
  {
    id: "rule_confined_ventilation",
    category: "safety_violation",
    descriptionKo: "밀폐공간 작업 시 환기조치 필수",
    descriptionEn: "Ventilation required for confined space work",
    guidance: "밀폐공간 작업 중 지속적인 강제환기 실시",
    reference: "산업안전보건기준에 관한 규칙 제620조",
    severity: "error",
    check: (checklist) => {
      const confined = checklist.find((c) => c.id === "conf_01");
      const ventilation = checklist.find((c) => c.id === "conf_03");
      return confined?.value === "✔" && ventilation?.value === "✖";
    },
  },
  {
    id: "rule_excavation_shoring",
    category: "safety_violation",
    descriptionKo: "굴착작업 시 흙막이 설치 필수",
    descriptionEn: "Shoring required for excavation work",
    guidance: "지반 붕괴 위험 깊이(1.5m 이상) 굴착 시 흙막이 지보공 설치",
    reference: "산업안전보건기준에 관한 규칙 제340조",
    severity: "error",
    check: (checklist) => {
      const excavation = checklist.find((c) => c.id === "exc_01");
      const shoring = checklist.find((c) => c.id === "exc_02");
      return excavation?.value === "✔" && shoring?.value === "✖";
    },
  },
  {
    id: "rule_excavation_ladder",
    category: "safety_violation",
    descriptionKo: "굴착작업 시 탈출사다리 설치 필수",
    descriptionEn: "Escape ladder required for excavation work",
    guidance: "깊이 1.5m 이상 굴착부에는 25m 간격으로 탈출용 사다리 설치",
    reference: "산업안전보건기준에 관한 규칙 제343조",
    severity: "error",
    check: (checklist) => {
      const excavation = checklist.find((c) => c.id === "exc_01");
      const ladder = checklist.find((c) => c.id === "exc_03");
      return excavation?.value === "✔" && ladder?.value === "✖";
    },
  },
  {
    id: "rule_electrical_lockout",
    category: "safety_violation",
    descriptionKo: "전기작업 시 잠금장치(LOTO) 적용 필수",
    descriptionEn: "Lockout/Tagout required for electrical work",
    guidance: "전원 차단 후 잠금장치 및 꼬리표 부착으로 재통전 방지",
    reference: "산업안전보건기준에 관한 규칙 제301조",
    severity: "error",
    check: (checklist) => {
      const electrical = checklist.find((c) => c.id === "elec_02");
      const lockout = checklist.find((c) => c.id === "elec_03");
      return electrical?.value === "✔" && lockout?.value === "✖";
    },
  },
  {
    id: "rule_height_protection",
    category: "safety_violation",
    descriptionKo: "고소작업 시 추락방호장치 설치 필수",
    descriptionEn: "Fall protection system required for work at height",
    guidance: "안전난간, 추락방호망, 개구부 덮개 등 추락방지 조치 필요",
    reference: "산업안전보건기준에 관한 규칙 제43조",
    severity: "error",
    check: (checklist) => {
      const heightWork = checklist.find((c) => c.id === "fall_01");
      const protection = checklist.find((c) => c.id === "fall_02");
      return heightWork?.value === "✔" && protection?.value === "✖";
    },
  },
  {
    id: "rule_fire_spark_prevention",
    category: "safety_violation",
    descriptionKo: "화기작업 시 불티비산 방지조치 필수",
    descriptionEn: "Spark prevention required for hot work",
    guidance: "용접·용단 작업 시 방화포 설치 및 가연물 제거",
    reference: "산업안전보건기준에 관한 규칙 제241조",
    severity: "warn",
    check: (checklist) => {
      const hotWork = checklist.find((c) => c.id === "fire_01");
      const sparkPrev = checklist.find((c) => c.id === "fire_03");
      return hotWork?.value === "✔" && sparkPrev?.value === "✖";
    },
  },

  // ========================================
  // Category: Logical Contradictions
  // ========================================
  {
    id: "rule_height_contradiction",
    category: "logical_contradiction",
    descriptionKo: "고소작업 미실시이나 추락방호장치 사용 - 기록 불일치",
    descriptionEn: "Contradiction: No work at height but fall protection marked",
    guidance: "체크리스트 기재 내용 재확인 필요 - 실제 작업과 기록 일치 여부 점검",
    severity: "warn",
    check: (checklist) => {
      const heightWork = checklist.find((c) => c.id === "fall_01");
      const fallProtection = checklist.find((c) => c.id === "fall_02");
      return heightWork?.value === "✖" && fallProtection?.value === "✔";
    },
  },
  {
    id: "rule_fire_contradiction",
    category: "logical_contradiction",
    descriptionKo: "화기작업 미실시이나 소화기 사용으로 표시 - 기록 불일치",
    descriptionEn: "Contradiction: No hot work but fire extinguisher marked as used",
    guidance: "화기작업 여부와 안전조치 기록의 일관성 확인 필요",
    severity: "warn",
    check: (checklist) => {
      const hotWork = checklist.find((c) => c.id === "fire_01");
      const extinguisher = checklist.find((c) => c.id === "fire_02");
      return hotWork?.value === "✖" && extinguisher?.value === "✔";
    },
  },
  {
    id: "rule_confined_contradiction",
    category: "logical_contradiction",
    descriptionKo: "밀폐공간 작업 미실시이나 산소농도 측정 실시 - 기록 불일치",
    descriptionEn: "Contradiction: No confined space work but oxygen measurement marked",
    guidance: "밀폐공간 작업 여부 재확인 필요",
    severity: "warn",
    check: (checklist) => {
      const confined = checklist.find((c) => c.id === "conf_01");
      const oxygen = checklist.find((c) => c.id === "conf_02");
      return confined?.value === "✖" && oxygen?.value === "✔";
    },
  },
  {
    id: "rule_excavation_contradiction",
    category: "logical_contradiction",
    descriptionKo: "굴착작업 미실시이나 흙막이 설치로 표시 - 기록 불일치",
    descriptionEn: "Contradiction: No excavation work but shoring marked as installed",
    guidance: "굴착작업 여부와 안전조치 기록의 일치 여부 확인",
    severity: "warn",
    check: (checklist) => {
      const excavation = checklist.find((c) => c.id === "exc_01");
      const shoring = checklist.find((c) => c.id === "exc_02");
      return excavation?.value === "✖" && shoring?.value === "✔";
    },
  },
  {
    id: "rule_electrical_contradiction",
    category: "logical_contradiction",
    descriptionKo: "전기작업 미실시이나 잠금장치 적용으로 표시 - 기록 불일치",
    descriptionEn: "Contradiction: No electrical work but lockout marked as applied",
    guidance: "전기작업 실시 여부와 LOTO 적용 기록 일치성 검토",
    severity: "warn",
    check: (checklist) => {
      const electrical = checklist.find((c) => c.id === "elec_02");
      const lockout = checklist.find((c) => c.id === "elec_03");
      return electrical?.value === "✖" && lockout?.value === "✔";
    },
  },

  // ========================================
  // Category: Suspicious Patterns (N/A)
  // ========================================
  // NOTE: Removed overly strict "critical N/A" rules (rule_critical_na_height,
  // rule_critical_na_fire, rule_critical_na_confined, rule_critical_na_excavation,
  // rule_critical_na_electrical). N/A is valid when those activities are not performed.
  // If needed in future, make these context-aware by checking work description.
  // ========================================
  {
    id: "rule_excessive_na",
    category: "suspicious_pattern",
    descriptionKo: "체크리스트 항목의 50% 이상이 N/A로 표시됨 - 점검 부실 가능성",
    descriptionEn: "Excessive N/A pattern: Over 50% of items marked N/A",
    guidance: "체크리스트를 실제 작업 내용에 맞게 작성했는지 재확인 필요",
    severity: "warn",
    check: (checklist) => {
      const naCount = checklist.filter((c) => c.value === "N/A").length;
      const totalCount = checklist.length;
      return totalCount > 0 && naCount / totalCount >= 0.5;
    },
  },

  // ========================================
  // Category: Completeness
  // ========================================
  {
    id: "rule_helmet_missing",
    category: "completeness",
    descriptionKo: "안전모 착용 여부 항목이 체크리스트에 없음",
    descriptionEn: "Required item missing: Safety helmet",
    guidance: "모든 현장 작업자는 안전모 착용이 필수이므로 체크리스트에 포함 필요",
    reference: "산업안전보건기준에 관한 규칙 제32조",
    severity: "warn",
    check: (checklist) => {
      return !checklist.find((c) => c.id === "ppe_01");
    },
  },
  {
    id: "rule_height_work_missing",
    category: "completeness",
    descriptionKo: "고소작업 여부 항목이 체크리스트에 없음",
    descriptionEn: "Required item missing: Work at height",
    guidance: "고소작업은 중대재해 다발 분야이므로 반드시 점검 필요",
    severity: "warn",
    check: (checklist) => {
      return !checklist.find((c) => c.id === "fall_01");
    },
  },
];

/**
 * Stage 2: Validate intra-checklist logic consistency
 * Checks IF-THEN rules within a single document
 * Enhanced with categorization and detailed guidance
 */
export function validateChecklistConsistency(checklist: ChecklistItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of CONSISTENCY_RULES) {
    if (rule.check(checklist)) {
      // Generate title based on rule category
      const title = getCategoryTitle(rule.category);

      // Build detailed message with guidance
      let message = rule.descriptionKo;
      if (rule.guidance) {
        message += `\n→ ${rule.guidance}`;
      }
      if (rule.reference) {
        message += `\n📋 ${rule.reference}`;
      }

      issues.push({
        severity: rule.severity,
        title,
        message,
        ruleId: rule.id,
      });
    }
  }

  return issues;
}

/**
 * Get human-readable title for rule category
 */
function getCategoryTitle(category: RuleCategory): string {
  switch (category) {
    case "safety_violation":
      return "안전규정 위반";
    case "logical_contradiction":
      return "논리적 불일치";
    case "completeness":
      return "필수 항목 누락";
    case "suspicious_pattern":
      return "의심스러운 패턴";
    default:
      return "검증 오류";
  }
}

/**
 * Get summary statistics of validation issues by category
 * Useful for reporting and analytics
 */
export function categorizeIssues(issues: ValidationIssue[]): {
  safetyViolations: number;
  contradictions: number;
  completeness: number;
  suspiciousPatterns: number;
  total: number;
} {
  const stats = {
    safetyViolations: 0,
    contradictions: 0,
    completeness: 0,
    suspiciousPatterns: 0,
    total: issues.length,
  };

  for (const issue of issues) {
    if (!issue.ruleId) continue;

    const rule = CONSISTENCY_RULES.find((r) => r.id === issue.ruleId);
    if (!rule) continue;

    switch (rule.category) {
      case "safety_violation":
        stats.safetyViolations++;
        break;
      case "logical_contradiction":
        stats.contradictions++;
        break;
      case "completeness":
        stats.completeness++;
        break;
      case "suspicious_pattern":
        stats.suspiciousPatterns++;
        break;
    }
  }

  return stats;
}

/**
 * Get all rules filtered by category
 * Useful for testing and documentation
 */
export function getRulesByCategory(category: RuleCategory): ConsistencyRule[] {
  return CONSISTENCY_RULES.filter((rule) => rule.category === category);
}

/**
 * Get total number of rules by category
 */
export function getRuleStats(): Record<RuleCategory, number> {
  return {
    safety_violation: getRulesByCategory("safety_violation").length,
    logical_contradiction: getRulesByCategory("logical_contradiction").length,
    completeness: getRulesByCategory("completeness").length,
    suspicious_pattern: getRulesByCategory("suspicious_pattern").length,
  };
}

/**
 * Validate checklist comprehensiveness
 * Returns warnings if checklist is incomplete or poorly filled out
 */
export function validateChecklistCompleteness(checklist: ChecklistItem[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if checklist is too short
  if (checklist.length < 5) {
    issues.push({
      severity: "warn",
      title: "체크리스트 불충분",
      message: "점검 항목이 5개 미만입니다. 현장 특성에 맞는 충분한 점검 항목이 필요합니다.",
      ruleId: "completeness_too_short",
    });
  }

  // Check if all items are checked (suspicious)
  const allChecked = checklist.every((item) => item.value === "✔");
  if (allChecked && checklist.length > 0) {
    issues.push({
      severity: "info",
      title: "전체 항목 적합 표시",
      message: "모든 점검 항목이 적합(✔)으로 표시되었습니다. 실제 현장 상황을 반영했는지 재확인이 필요합니다.",
      ruleId: "pattern_all_checked",
    });
  }

  // Check if all items are N/A (highly suspicious)
  const allNA = checklist.every((item) => item.value === "N/A");
  if (allNA && checklist.length > 0) {
    issues.push({
      severity: "error",
      title: "체크리스트 미작성",
      message: "모든 항목이 N/A로 표시되었습니다. 체크리스트가 실제 작업에 맞게 작성되지 않았을 가능성이 있습니다.",
      ruleId: "pattern_all_na",
    });
  }

  return issues;
}

/**
 * Main document validation function (Stage 1 + Stage 2)
 */
export function validateDocument(data: DocData): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. 필수 필드 검증
  if (!data.fields.점검일자) {
    issues.push({
      severity: "error",
      title: "점검일자 누락",
      message: "점검일자가 식별되지 않았습니다.",
    });
  }

  if (!data.fields.현장명) {
    issues.push({
      severity: "error",
      title: "현장명 누락",
      message: "현장명이 기재되지 않았습니다.",
    });
  }

  if (!data.fields.작업내용) {
    issues.push({
      severity: "error",
      title: "작업내용 누락",
      message: "작업내용이 상세히 기술되지 않았습니다.",
    });
  }

  // 2. 결재/서명 검증
  // 담당자 서명은 필수 (AI cannot fix - requires physical signature)
  if (data.signature.담당 !== "present") {
    issues.push({
      severity: "error",
      title: "담당자 서명 누락",
      message: "담당자 결재란이 비어있거나 식별되지 않습니다.",
      isAIFixable: false, // Human-only: requires physical signature
    });
  }

  // 소장 서명은 경고(상황에 따라 다를 수 있으므로) (AI cannot fix)
  if (data.signature.소장 !== "present") {
    issues.push({
      severity: "warn",
      title: "관리책임자 서명 미비",
      message: "현장소장(관리책임자)의 서명이 확인되지 않았습니다.",
      isAIFixable: false, // Human-only: requires physical signature
    });
  }

  // 3. 작업인원 검증
  if (!data.fields.작업인원) {
    issues.push({
      severity: "warn",
      title: "작업인원 미기재",
      message: "투입 인원 수가 확인되지 않습니다.",
    });
  }

  // 4. Stage 2: Checklist Validation
  if (data.checklist && data.checklist.length > 0) {
    // 4a. Check completeness (required items exist, reasonable length)
    const completenessIssues = validateChecklistCompleteness(data.checklist);
    issues.push(...completenessIssues);

    // 4b. Check logical consistency (IF-THEN rules)
    const checklistIssues = validateChecklistConsistency(data.checklist);
    issues.push(...checklistIssues);
  } else {
    // No checklist provided at all
    issues.push({
      severity: "error",
      title: "체크리스트 누락",
      message: "안전 점검 체크리스트가 문서에 포함되지 않았습니다.",
      ruleId: "completeness_no_checklist",
    });
  }

  return issues;
}
