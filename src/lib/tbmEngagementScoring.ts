/**
 * TBM Engagement Quality Scoring
 *
 * Analyzes transcription patterns to ESTIMATE meeting engagement level.
 * Based on research showing high-engagement training is more effective.
 *
 * IMPORTANT: This is an indicative estimate, not a definitive measurement.
 * Whisper transcription doesn't provide speaker diarization, so we infer
 * engagement from text patterns. Results should be interpreted as suggestions
 * rather than accurate assessments, especially in noisy construction environments.
 *
 * Reference: PMC - "Evaluation of toolbox safety training in construction"
 * Key finding: Participatory safety meetings are significantly more effective
 * than one-way lectures (monologue-style TBMs).
 */

export interface EngagementScore {
  score: number; // 0-100
  level: "high" | "medium" | "low";
  factors: EngagementFactor[];
  suggestions: string[];
}

export interface EngagementFactor {
  name: string;
  nameKo: string;
  detected: boolean;
  impact: number; // Points added/subtracted
  evidence?: string;
}

/**
 * Patterns indicating different speakers
 * Korean speech patterns that suggest turn-taking
 */
const SPEAKER_CHANGE_PATTERNS = [
  // Question markers
  /[가-힣]+\s*(입니까|입니까\?|인가요|세요|할까요|있나요|될까요|합니까)/g,
  // Response markers
  /^(네|예|아니요|네,|예,|아,|음,|그렇습니다)/gm,
  // Direct address
  /[가-힣]+\s*(씨|님|과장|부장|소장|반장|기사)/g,
  // Question words
  /(어떻게|왜|무엇|뭐|어디|언제|누가|몇)/g,
];

/**
 * Patterns indicating worker participation
 */
const PARTICIPATION_PATTERNS = [
  // Questions from workers
  /질문\s*(있|하)/g,
  /(의견|생각)\s*(있|말씀)/g,
  // Acknowledgments suggesting multiple speakers
  /알겠습니다/g,
  /확인했습니다/g,
  /이해했습니다/g,
  // Names being called (suggests interaction)
  /[가-힣]{2,4}\s*(씨|님)\s*(는|은|이|가)/g,
];

/**
 * Analyze TBM transcription for engagement quality (INDICATIVE ESTIMATE)
 *
 * Note: Scoring is intentionally forgiving due to limitations of
 * text-based analysis without proper speaker diarization.
 */
export function analyzeEngagement(transcription: string): EngagementScore {
  const factors: EngagementFactor[] = [];
  let totalScore = 60; // Start at higher baseline (forgiving)
  const suggestions: string[] = [];

  // Factor 1: Question presence (indicates discussion)
  const questionCount = (transcription.match(/\?/g) || []).length;
  const hasQuestions = questionCount >= 2;
  factors.push({
    name: "Questions Asked",
    nameKo: "질문 여부 (추정)",
    detected: hasQuestions,
    impact: hasQuestions ? 12 : -3,  // Reduced penalty
    evidence: hasQuestions ? `${questionCount}개의 질문 감지` : undefined,
  });
  totalScore += hasQuestions ? 12 : -3;
  if (!hasQuestions) {
    suggestions.push(
      "TBM 중 작업자들에게 질문을 유도하세요 (예: '위험요인이 뭐가 있을까요?')"
    );
  }

  // Factor 2: Multiple speaker indicators (estimated from text patterns)
  let speakerChangeCount = 0;
  for (const pattern of SPEAKER_CHANGE_PATTERNS) {
    speakerChangeCount += (transcription.match(pattern) || []).length;
  }
  const hasMultipleSpeakers = speakerChangeCount >= 3;
  factors.push({
    name: "Multiple Speakers",
    nameKo: "다자 참여 (추정)",
    detected: hasMultipleSpeakers,
    impact: hasMultipleSpeakers ? 15 : -5,  // Reduced penalty - hard to detect accurately
    evidence: hasMultipleSpeakers
      ? `${speakerChangeCount}회 화자 전환 패턴 감지`
      : undefined,
  });
  totalScore += hasMultipleSpeakers ? 15 : -5;
  if (!hasMultipleSpeakers) {
    suggestions.push("일방적 전달보다 작업자들과 대화형으로 진행해 보세요");
  }

  // Factor 3: Worker participation markers
  let participationCount = 0;
  for (const pattern of PARTICIPATION_PATTERNS) {
    participationCount += (transcription.match(pattern) || []).length;
  }
  const hasParticipation = participationCount >= 2;
  factors.push({
    name: "Worker Participation",
    nameKo: "작업자 참여 (추정)",
    detected: hasParticipation,
    impact: hasParticipation ? 12 : -2,  // Reduced penalty
    evidence: hasParticipation
      ? `${participationCount}회 참여 표현 감지`
      : undefined,
  });
  totalScore += hasParticipation ? 12 : -2;
  if (!hasParticipation) {
    suggestions.push(
      "작업자들이 '알겠습니다', '질문 있습니다' 등으로 참여하도록 유도해 보세요"
    );
  }

  // Factor 4: Meeting length (too short = rushed)
  const wordCount = transcription.split(/\s+/).length;
  const adequateLength = wordCount >= 80; // Lowered threshold - 80 words minimum
  factors.push({
    name: "Adequate Duration",
    nameKo: "적정 소요시간",
    detected: adequateLength,
    impact: adequateLength ? 8 : -3,  // Reduced penalty
    evidence: `약 ${Math.round(wordCount / 50)}분 분량 (${wordCount} 단어)`,
  });
  totalScore += adequateLength ? 8 : -3;
  if (!adequateLength) {
    suggestions.push("TBM이 짧은 편입니다. 충분한 시간을 확보해 보세요");
  }

  // Factor 5: Name mentions (personalization)
  const namePattern = /[가-힣]{2,4}\s*(씨|님)/g;
  const nameCount = (transcription.match(namePattern) || []).length;
  const hasNameMentions = nameCount >= 2;
  factors.push({
    name: "Personalized Address",
    nameKo: "개인별 호명",
    detected: hasNameMentions,
    impact: hasNameMentions ? 8 : 0,  // No penalty for missing
    evidence: hasNameMentions ? `${nameCount}회 이름 호명` : undefined,
  });
  totalScore += hasNameMentions ? 8 : 0;
  if (!hasNameMentions && totalScore < 65) {
    suggestions.push("작업자를 이름으로 호명하여 참여를 유도해 보세요");
  }

  // Normalize score to 0-100
  totalScore = Math.max(0, Math.min(100, totalScore));

  // Determine level
  let level: "high" | "medium" | "low";
  if (totalScore >= 75) {
    level = "high";
  } else if (totalScore >= 50) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    score: totalScore,
    level,
    factors,
    suggestions,
  };
}

/**
 * Get engagement level label in Korean (indicative)
 */
export function getEngagementLevelKo(
  level: "high" | "medium" | "low"
): string {
  switch (level) {
    case "high":
      return "양호 (추정)";
    case "medium":
      return "보통 (추정)";
    case "low":
      return "개선 권장";
  }
}

/**
 * Get color class for engagement level (Tailwind)
 */
export function getEngagementColorClass(
  level: "high" | "medium" | "low"
): string {
  switch (level) {
    case "high":
      return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30";
    case "medium":
      return "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30";
    case "low":
      return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30";
  }
}

/**
 * Get border color class for engagement level
 */
export function getEngagementBorderClass(
  level: "high" | "medium" | "low"
): string {
  switch (level) {
    case "high":
      return "border-green-500";
    case "medium":
      return "border-yellow-500";
    case "low":
      return "border-red-500";
  }
}

/**
 * Generate validation issue for low engagement TBM
 *
 * NOTE: Issues are "info" severity since engagement detection is indicative,
 * not definitive. Whisper doesn't provide speaker diarization.
 */
export interface EngagementValidationIssue {
  id: string;
  severity: "error" | "warn" | "info";
  title: string;
  message: string;
  ruleId: string;
  confidence?: number;
}

export function generateEngagementIssue(
  engagementScore: EngagementScore
): EngagementValidationIssue | null {
  if (engagementScore.level === "high") {
    return null; // No issue for high engagement
  }

  const missingFactors = engagementScore.factors
    .filter((f) => !f.detected)
    .map((f) => f.nameKo.replace(" (추정)", ""));

  if (engagementScore.level === "low") {
    return {
      id: `tbm_engagement_low_${Date.now()}`,
      severity: "info",  // Changed from "warn" to "info" - indicative only
      title: "TBM 참여도 개선 권장",
      message: `음성 분석 결과, TBM이 일방적 전달 방식으로 진행된 것으로 추정됩니다.
(참여도 추정 점수: ${engagementScore.score}점)

※ 이 분석은 음성 패턴 기반 추정치이며, 실제 상황과 다를 수 있습니다.

개선 제안:
${engagementScore.suggestions.slice(0, 2).map(s => `• ${s}`).join("\n")}`,
      ruleId: "tbm_engagement_low",
      confidence: engagementScore.score,
    };
  }

  // Medium engagement - only show if score is quite low
  if (engagementScore.level === "medium" && engagementScore.score < 55) {
    return {
      id: `tbm_engagement_medium_${Date.now()}`,
      severity: "info",
      title: "TBM 참여도 참고사항",
      message: `음성 분석 기반 참여도 추정: ${engagementScore.score}점 (보통)

※ 참고용 추정치입니다.

${engagementScore.suggestions[0] ? `제안: ${engagementScore.suggestions[0]}` : ""}`,
      ruleId: "tbm_engagement_medium",
      confidence: engagementScore.score,
    };
  }

  return null;
}
