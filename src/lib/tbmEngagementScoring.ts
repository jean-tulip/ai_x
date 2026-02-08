/**
 * TBM Engagement Quality Scoring
 *
 * Analyzes transcription patterns to assess meeting engagement level.
 * Based on research showing high-engagement training is more effective.
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
 * Analyze TBM transcription for engagement quality
 */
export function analyzeEngagement(transcription: string): EngagementScore {
  const factors: EngagementFactor[] = [];
  let totalScore = 50; // Start at baseline
  const suggestions: string[] = [];

  // Factor 1: Question presence (indicates discussion)
  const questionCount = (transcription.match(/\?/g) || []).length;
  const hasQuestions = questionCount >= 2;
  factors.push({
    name: "Questions Asked",
    nameKo: "질문 여부",
    detected: hasQuestions,
    impact: hasQuestions ? 15 : -10,
    evidence: hasQuestions ? `${questionCount}개의 질문 감지` : undefined,
  });
  totalScore += hasQuestions ? 15 : -10;
  if (!hasQuestions) {
    suggestions.push(
      "TBM 중 작업자들에게 질문을 유도하세요 (예: '위험요인이 뭐가 있을까요?')"
    );
  }

  // Factor 2: Multiple speaker indicators
  let speakerChangeCount = 0;
  for (const pattern of SPEAKER_CHANGE_PATTERNS) {
    speakerChangeCount += (transcription.match(pattern) || []).length;
  }
  const hasMultipleSpeakers = speakerChangeCount >= 3;
  factors.push({
    name: "Multiple Speakers",
    nameKo: "다자 참여",
    detected: hasMultipleSpeakers,
    impact: hasMultipleSpeakers ? 20 : -15,
    evidence: hasMultipleSpeakers
      ? `${speakerChangeCount}회 화자 전환 감지`
      : undefined,
  });
  totalScore += hasMultipleSpeakers ? 20 : -15;
  if (!hasMultipleSpeakers) {
    suggestions.push("일방적 전달보다 작업자들과 대화형으로 진행하세요");
  }

  // Factor 3: Worker participation markers
  let participationCount = 0;
  for (const pattern of PARTICIPATION_PATTERNS) {
    participationCount += (transcription.match(pattern) || []).length;
  }
  const hasParticipation = participationCount >= 2;
  factors.push({
    name: "Worker Participation",
    nameKo: "작업자 참여",
    detected: hasParticipation,
    impact: hasParticipation ? 15 : -5,
    evidence: hasParticipation
      ? `${participationCount}회 참여 표현 감지`
      : undefined,
  });
  totalScore += hasParticipation ? 15 : -5;
  if (!hasParticipation) {
    suggestions.push(
      "작업자들이 '알겠습니다', '질문 있습니다' 등으로 참여하도록 유도하세요"
    );
  }

  // Factor 4: Meeting length (too short = rushed)
  const wordCount = transcription.split(/\s+/).length;
  const adequateLength = wordCount >= 100; // Minimum ~2 minutes of speech
  factors.push({
    name: "Adequate Duration",
    nameKo: "적정 소요시간",
    detected: adequateLength,
    impact: adequateLength ? 10 : -10,
    evidence: `약 ${Math.round(wordCount / 50)}분 분량 (${wordCount} 단어)`,
  });
  totalScore += adequateLength ? 10 : -10;
  if (!adequateLength) {
    suggestions.push("TBM이 너무 짧습니다. 최소 5-10분 이상 진행하세요");
  }

  // Factor 5: Name mentions (personalization)
  const namePattern = /[가-힣]{2,4}\s*(씨|님)/g;
  const nameCount = (transcription.match(namePattern) || []).length;
  const hasNameMentions = nameCount >= 2;
  factors.push({
    name: "Personalized Address",
    nameKo: "개인별 호명",
    detected: hasNameMentions,
    impact: hasNameMentions ? 10 : 0,
    evidence: hasNameMentions ? `${nameCount}회 이름 호명` : undefined,
  });
  totalScore += hasNameMentions ? 10 : 0;
  if (!hasNameMentions && totalScore < 70) {
    suggestions.push("작업자를 이름으로 호명하여 참여를 유도하세요");
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
 * Get engagement level label in Korean
 */
export function getEngagementLevelKo(
  level: "high" | "medium" | "low"
): string {
  switch (level) {
    case "high":
      return "높음 (참여형)";
    case "medium":
      return "보통";
    case "low":
      return "낮음 (일방적 전달)";
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
 * Research shows low-engagement TBMs are less effective at preventing accidents
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
    .map((f) => f.nameKo);

  if (engagementScore.level === "low") {
    return {
      id: `tbm_engagement_low_${Date.now()}`,
      severity: "warn",
      title: "TBM 참여도 낮음",
      message: `TBM이 일방적 전달 방식으로 진행된 것으로 보입니다 (참여도 점수: ${engagementScore.score}점).
연구에 따르면 참여형 TBM이 일방적 TBM보다 사고 예방 효과가 높습니다.

부족한 항목: ${missingFactors.join(", ")}

${engagementScore.suggestions.slice(0, 2).join("\n")}`,
      ruleId: "tbm_engagement_low",
      confidence: engagementScore.score,
    };
  }

  // Medium engagement - softer warning
  if (engagementScore.level === "medium" && engagementScore.score < 60) {
    return {
      id: `tbm_engagement_medium_${Date.now()}`,
      severity: "info",
      title: "TBM 참여도 개선 권장",
      message: `TBM 참여도가 보통 수준입니다 (${engagementScore.score}점).

개선이 필요한 항목: ${missingFactors.join(", ")}

${engagementScore.suggestions[0] || ""}`,
      ruleId: "tbm_engagement_medium",
      confidence: engagementScore.score,
    };
  }

  return null;
}
