// src/lib/riskMatrix.ts
/**
 * Stage 3: Risk Matrix System
 *
 * Purpose: Calculate objective risk scores based on document analysis
 * and compare with documented risk levels to detect inconsistencies.
 */

import type { DocData, ValidationIssue, ChecklistItem } from "./validator";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskCalculation {
  calculatedRisk: RiskLevel;
  documentedRisk: RiskLevel | null;
  riskScore: number; // 0-100
  factors: RiskFactor[];
  inconsistency: boolean;
  recommendation?: string;
}

export interface RiskFactor {
  category: string;
  description: string;
  impact: number; // Contribution to risk score (0-100)
  severity: "low" | "medium" | "high" | "critical";
}

/**
 * 위험성 평가 행렬 (Risk Assessment Matrix)
 *
 * 한국 산업안전보건법 및 KOSHA GUIDE 기반
 * 빈도(Frequency) × 강도(Severity) = 위험도(Risk)
 */

// 작업 유형별 기본 위험도
// [Brief #2] Fall hazard weights increased based on Hwang et al. (2023):
// "Scaffolding and working platforms" = #1 accident cause (AF=190, RF=0.725)
// "Fall" = 71% of fatal accidents (AF=547, RF=0.710)
const WORK_TYPE_BASE_RISK: Record<string, number> = {
  fall_01: 35, // 고소작업 (추락 위험 - 최고, 사망사고의 71%) [INCREASED from 25]
  conf_01: 30, // 밀폐공간작업 (질식 위험 - 최고)
  fire_01: 20, // 화기작업 (화재 위험 - 높음)
  exc_01: 15, // 굴착작업 (붕괴 위험 - 중간)
  elec_02: 25, // 전기작업 (감전 위험 - 매우 높음)
};

// 안전조치 미이행 시 추가 위험도
// [Brief #2] Fall-related violations increased based on research findings
const VIOLATION_RISK_INCREASE: Record<string, number> = {
  ppe_03: 30, // 안전대 미착용 (추락 시 치명적) [INCREASED from 20 - critical for falls]
  fall_02: 25, // 추락방호장치 없음 [INCREASED from 15]
  fire_02: 10, // 소화기 미비치
  conf_02: 25, // 산소농도 미측정 (질식 위험)
  conf_03: 15, // 환기 미조치
  exc_02: 20, // 흙막이 미설치 (붕괴 위험)
  elec_03: 15, // 잠금장치 미사용 (감전 위험)
};

// Risk scoring constants
const SIGNATURE_MISSING_RISK = 10;

// Risk level thresholds (score ranges)
const RISK_THRESHOLD_CRITICAL = 61; // 61+ = critical
const RISK_THRESHOLD_HIGH = 41;     // 41-60 = high
const RISK_THRESHOLD_MEDIUM = 21;   // 21-40 = medium
                                     // 0-20 = low

// Risk inconsistency detection
const RISK_INCONSISTENCY_THRESHOLD = 2; // Level difference threshold

// Checklist analysis thresholds
const CHECKLIST_EMPTY_IMPACT = 15;      // Impact when checklist is completely empty
const CHECKLIST_NA_RATIO_THRESHOLD = 0.6; // 60% N/A = suspicious
const CHECKLIST_NA_IMPACT = 10;          // Impact when excessive N/A usage
const CHECKLIST_NULL_IMPACT_PER_ITEM = 3; // Impact per unfi lled item
const CHECKLIST_NULL_HIGH_THRESHOLD = 3;  // 3+ null items = high severity

/**
 * 문서 데이터를 분석하여 객관적 위험도를 계산합니다.
 */
export function calculateRiskLevel(docData: DocData): RiskCalculation {
  let riskScore = 0;
  const factors: RiskFactor[] = [];

  // 1. 작업 유형 기반 기본 위험도 평가
  const highRiskWorkFactors = assessHighRiskWork(docData.checklist || []);
  factors.push(...highRiskWorkFactors);
  riskScore += highRiskWorkFactors.reduce((sum, f) => sum + f.impact, 0);

  // 2. 안전조치 위반 평가
  const violationFactors = assessViolations(docData.checklist || []);
  factors.push(...violationFactors);
  riskScore += violationFactors.reduce((sum, f) => sum + f.impact, 0);

  // 3. 서명 누락 평가
  const signatureFactors = assessSignatures(docData.signature);
  factors.push(...signatureFactors);
  riskScore += signatureFactors.reduce((sum, f) => sum + f.impact, 0);

  // 4. 체크리스트 완성도 평가
  const completenessFactors = assessCompleteness(docData.checklist || []);
  factors.push(...completenessFactors);
  riskScore += completenessFactors.reduce((sum, f) => sum + f.impact, 0);

  // 5. 계산된 위험도 결정 (0-100 점수 기반)
  const calculatedRisk = scoreToRiskLevel(riskScore);

  // 6. 문서에 기록된 위험도와 비교
  const documentedRisk = docData.riskLevel || null;
  const inconsistency = documentedRisk ? checkInconsistency(calculatedRisk, documentedRisk) : false;

  // 7. 권고사항 생성
  const recommendation = inconsistency
    ? generateRecommendation(calculatedRisk, documentedRisk!, factors)
    : undefined;

  return {
    calculatedRisk,
    documentedRisk,
    riskScore: Math.min(100, riskScore),
    factors,
    inconsistency,
    recommendation,
  };
}

/**
 * 고위험 작업 수행 여부 평가
 */
function assessHighRiskWork(checklist: ChecklistItem[]): RiskFactor[] {
  const factors: RiskFactor[] = [];

  for (const item of checklist) {
    // ✅ Defensive null checks for malformed checklist items
    if (!item || typeof item !== 'object') continue;
    if (!item.id || !item.value) continue;

    if (item.value === "✔" && WORK_TYPE_BASE_RISK[item.id]) {
      const impact = WORK_TYPE_BASE_RISK[item.id];
      let severity: RiskFactor["severity"] = "medium";
      if (impact >= 25) severity = "critical";
      else if (impact >= 20) severity = "high";
      else if (impact >= 15) severity = "medium";

      factors.push({
        category: "고위험 작업",
        description: `${item.nameKo || item.id} 실시 (${item.id})`,
        impact,
        severity,
      });
    }
  }

  return factors;
}

/**
 * 안전조치 위반 사항 평가
 */
function assessViolations(checklist: ChecklistItem[]): RiskFactor[] {
  const factors: RiskFactor[] = [];

  // 고위험 작업별 필수 안전조치 매핑
  const requiredSafetyMeasures: Record<string, string[]> = {
    fall_01: ["ppe_03", "fall_02"], // 고소작업 → 안전대, 추락방호장치
    fire_01: ["fire_02"], // 화기작업 → 소화기
    conf_01: ["conf_02", "conf_03"], // 밀폐공간 → 산소측정, 환기
    exc_01: ["exc_02", "exc_03"], // 굴착작업 → 흙막이, 탈출사다리
    elec_02: ["elec_03"], // 전기작업 → 잠금장치
  };

  // ✅ Filter out malformed items before creating map
  const checkMap = new Map(
    checklist
      .filter((item) => item && typeof item === 'object' && item.id && item.value)
      .map((item) => [item.id, item.value])
  );

  for (const [workId, safetyIds] of Object.entries(requiredSafetyMeasures)) {
    const isWorkPerformed = checkMap.get(workId) === "✔";
    if (!isWorkPerformed) continue;

    for (const safetyId of safetyIds) {
      const safetyValue = checkMap.get(safetyId);
      if (safetyValue === "✖") {
        const impact = VIOLATION_RISK_INCREASE[safetyId] || 10;
        let severity: RiskFactor["severity"] = "medium";
        if (impact >= 20) severity = "critical";
        else if (impact >= 15) severity = "high";
        else if (impact >= 10) severity = "medium";

        const safetyItem = checklist.find((c) => c.id === safetyId);
        factors.push({
          category: "안전조치 위반",
          description: `${safetyItem?.nameKo || safetyId} 미이행`,
          impact,
          severity,
        });
      }
    }
  }

  return factors;
}

/**
 * 서명 누락 평가
 */
function assessSignatures(signature: DocData["signature"]): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (signature.담당 === "missing") {
    factors.push({
      category: "서명 누락",
      description: "담당자 서명 없음 (실무 검증 미확인)",
      impact: SIGNATURE_MISSING_RISK,
      severity: "medium",
    });
  }

  if (signature.소장 === "missing") {
    factors.push({
      category: "서명 누락",
      description: "관리책임자 서명 없음 (관리 감독 미확인)",
      impact: SIGNATURE_MISSING_RISK,
      severity: "medium",
    });
  }

  return factors;
}

/**
 * 체크리스트 완성도 평가
 */
function assessCompleteness(checklist: ChecklistItem[]): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (checklist.length === 0) {
    factors.push({
      category: "완성도",
      description: "체크리스트 항목 없음",
      impact: CHECKLIST_EMPTY_IMPACT,
      severity: "high",
    });
    return factors;
  }

  // N/A 과다 사용 체크
  // ✅ Filter out malformed items before counting
  const validItems = checklist.filter((item) => item && typeof item === 'object' && item.value);
  const naCount = validItems.filter((item) => item.value === "N/A").length;
  const naRatio = validItems.length > 0 ? naCount / validItems.length : 0;

  if (naRatio > CHECKLIST_NA_RATIO_THRESHOLD) {
    factors.push({
      category: "완성도",
      description: `N/A 과다 표시 (${Math.round(naRatio * 100)}%)`,
      impact: CHECKLIST_NA_IMPACT,
      severity: "medium",
    });
  }

  // null 값 (미작성) 체크
  const nullCount = checklist.filter((item) => item.value === null).length;
  if (nullCount > 0) {
    factors.push({
      category: "완성도",
      description: `미작성 항목 ${nullCount}개`,
      impact: nullCount * CHECKLIST_NULL_IMPACT_PER_ITEM,
      severity: nullCount > CHECKLIST_NULL_HIGH_THRESHOLD ? "high" : "medium",
    });
  }

  return factors;
}

/**
 * 점수를 위험도 등급으로 변환
 *
 * 기준:
 * - 0-20: Low (경미)
 * - 21-40: Medium (보통)
 * - 41-60: High (높음)
 * - 61+: Critical (매우 높음)
 */
function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLD_CRITICAL) return "critical";
  if (score >= RISK_THRESHOLD_HIGH) return "high";
  if (score >= RISK_THRESHOLD_MEDIUM) return "medium";
  return "low";
}

/**
 * 계산된 위험도와 문서 기록 위험도의 불일치 여부 확인
 */
function checkInconsistency(calculated: RiskLevel, documented: RiskLevel): boolean {
  const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
  const calcIndex = levels.indexOf(calculated);
  const docIndex = levels.indexOf(documented);

  // N단계 이상 차이나면 불일치로 판단
  return Math.abs(calcIndex - docIndex) >= RISK_INCONSISTENCY_THRESHOLD;
}

/**
 * 위험도 불일치 시 권고사항 생성
 */
function generateRecommendation(
  calculated: RiskLevel,
  documented: RiskLevel,
  factors: RiskFactor[]
): string {
  const riskLevelKo: Record<RiskLevel, string> = {
    low: "낮음",
    medium: "보통",
    high: "높음",
    critical: "매우 높음",
  };

  const criticalFactors = factors.filter((f) => f.severity === "critical" || f.severity === "high");

  let recommendation = `문서에 기록된 위험도(${riskLevelKo[documented]})와 객관적 분석 결과(${riskLevelKo[calculated]})가 불일치합니다.`;

  if (criticalFactors.length > 0) {
    recommendation += ` 주요 위험 요인: ${criticalFactors.map((f) => f.description).join(", ")}.`;
  }

  const levels: RiskLevel[] = ["low", "medium", "high", "critical"];
  const calcIndex = levels.indexOf(calculated);
  const docIndex = levels.indexOf(documented);

  if (calcIndex > docIndex) {
    recommendation += " 실제 위험도가 기록보다 높을 수 있으므로 재평가가 필요합니다.";
  } else {
    recommendation += " 기록된 위험도가 과대평가되었을 가능성이 있습니다.";
  }

  return recommendation;
}

/**
 * 위험도 계산 결과를 ValidationIssue 형식으로 변환
 */
export function riskCalculationToIssues(riskCalc: RiskCalculation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (riskCalc.inconsistency && riskCalc.recommendation) {
    issues.push({
      ruleId: "risk_matrix_inconsistency",
      severity: "warn",
      title: "위험도 평가 불일치",
      message: riskCalc.recommendation,
    });
  }

  // 고위험 요인들을 정보성 메시지로 추가
  const criticalFactors = riskCalc.factors.filter((f) => f.severity === "critical");
  if (criticalFactors.length > 0) {
    issues.push({
      ruleId: "risk_matrix_critical_factors",
      severity: "info",
      title: "위험 요인 식별",
      message: `주요 위험 요인 ${criticalFactors.length}건 식별됨: ${criticalFactors.map((f) => f.description).join(", ")}`,
    });
  }

  return issues;
}
