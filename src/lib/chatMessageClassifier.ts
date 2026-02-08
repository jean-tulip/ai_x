/**
 * Chat Message Classifier
 *
 * [KEY DESIGN DECISION] Why classify messages rather than adding a button?
 *
 * Option A: Add "📎 Include in report" button on each chat message
 * Option B: Auto-detect synthesis/corrective messages by the user prompt
 *
 * We chose Option B because:
 * - The demo flow is predictable (user always asks for synthesis, then corrective action)
 * - One less manual step for the safety officer
 * - The detection is simple — we look at the USER's message, not the AI's response
 *
 * If detection fails, the PDF still works — it just won't have
 * the narrative section, falling back to the existing data-first layout.
 */

export type ChatMessageType = "synthesis" | "corrective_action" | "general";

/**
 * Classify a user message to determine if the AI's response
 * should be captured for the PDF export.
 */
export function classifyUserMessage(userText: string): ChatMessageType {
  const text = userText.toLowerCase();

  // Synthesis request patterns (Korean + English)
  const synthesisPatterns = [
    "종합",           // comprehensive/synthesis
    "세 자료",        // three sources
    "세 가지",        // three types
    "분석해",         // analyze
    "비교해",         // compare
    "불일치",         // inconsistency
    "교차",           // cross (as in cross-validation)
    "three-way",
    "cross-validate",
    "tbm.*점검표",    // TBM and checklist together
    "점검표.*tbm",
    "사진.*점검",     // photo and inspection together
  ];

  // Corrective action request patterns
  const correctivePatterns = [
    "시정조치",       // corrective action
    "요청서",         // request form
    "조치",           // action/measure
    "개선",           // improvement
    "corrective",
    "조치 요청",
    "시정 조치",
  ];

  // Check corrective first (more specific)
  if (correctivePatterns.some(p => {
    if (p.includes(".*")) {
      return new RegExp(p).test(text);
    }
    return text.includes(p);
  })) {
    return "corrective_action";
  }

  // Then synthesis
  if (synthesisPatterns.some(p => {
    if (p.includes(".*")) {
      return new RegExp(p).test(text);
    }
    return text.includes(p);
  })) {
    return "synthesis";
  }

  return "general";
}
