import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { ReportContext } from "@/lib/chatTools";
import { aggregateRootCauses } from "@/lib/rootCauseMapping";

export const runtime = "nodejs";

// Lazy initialization to avoid errors when API keys are not set
let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;

function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

type ClientMsg = { role: "user" | "ai"; text: string };

/**
 * Build the system prompt with enriched context
 */
function buildSystemPrompt(reportContext: ReportContext | null): string {
  let systemPrompt = `너는 산업안전 문서 검증을 돕는 한국어 AI 안전 컨설턴트다.

당신의 역할:
- 검증 결과를 명확하게 설명
- 규칙 위반 이유와 수정 방법 제시
- 안전 관련 규정 참고 제공
- 친근하고 전문적인 어조 유지

답변 시 주의사항:
- 짧고 명확하게 답변
- 전문 용어는 쉽게 풀어서 설명
- 법규 위반이 아니라 "문서 불일치" 관점으로 설명
- 단계별로 정리하여 제시`;

  // Inject document context if available (from extractedData or legacy fields)
  const extracted = reportContext?.extractedData || (reportContext ? {
    docType: reportContext.docType || "unknown",
    fields: reportContext.fields || {},
    signature: reportContext.signature || {},
    checklist: reportContext.checklist || [],
    riskLevel: reportContext.riskLevel,
    inspectorName: reportContext.inspectorName,
  } : null);

  if (extracted) {
    systemPrompt += `\n\n[현재 문서 정보]
- 문서 유형: ${extracted.docType || "미확인"}
- 점검일자: ${extracted.fields?.점검일자 || "누락"}
- 현장명: ${extracted.fields?.현장명 || "누락"}
- 작업내용: ${extracted.fields?.작업내용 || "누락"}
- 작업인원: ${extracted.fields?.작업인원 || "누락"}
- 담당자 서명: ${extracted.signature?.담당 || "미확인"}
- 소장 서명: ${extracted.signature?.소장 || "미확인"}
- 점검자: ${extracted.inspectorName || "미확인"}
- 위험도: ${extracted.riskLevel || "미평가"}`;

    // Add checklist items
    const checklist = extracted.checklist;
    if (checklist && checklist.length > 0) {
      systemPrompt += `\n\n[체크리스트 항목]`;
      for (const c of checklist) {
        systemPrompt += `\n- ${c.nameKo}: ${c.value || "미기재"}`;
      }
    }
  }

  // Add detected issues
  const issues = reportContext?.issues;
  if (issues && issues.length > 0) {
    systemPrompt += `\n\n[검출된 이슈]`;
    for (const i of issues) {
      systemPrompt += `\n- [${i.severity}] ${i.title}: ${i.message}${i.ruleId ? ` (규칙: ${i.ruleId})` : ""}`;
    }
  }

  // Add project context
  if (reportContext?.projectContext?.projectName) {
    systemPrompt += `\n\n[프로젝트]: ${reportContext.projectContext.projectName}`;
    if (reportContext.projectContext.masterPlanSummary) {
      systemPrompt += `\n[마스터 안전 계획 요약]: ${reportContext.projectContext.masterPlanSummary}`;
    }
  }

  // Add pattern warnings
  if (reportContext?.patternWarnings && reportContext.patternWarnings.length > 0) {
    systemPrompt += `\n\n[패턴 경고]`;
    for (const w of reportContext.patternWarnings) {
      systemPrompt += `\n- ${w}`;
    }
  }

  // Add TBM context for richer safety consultation
  if (reportContext?.tbmContext) {
    const tbm = reportContext.tbmContext;
    systemPrompt += `\n\n[TBM 정보 - 오늘 작업 전 안전회의]`;
    if (tbm.workType) {
      systemPrompt += `\n- 작업 유형: ${tbm.workType}`;
    }
    if (tbm.extractedHazards && tbm.extractedHazards.length > 0) {
      systemPrompt += `\n- 논의된 위험요인: ${tbm.extractedHazards.join(", ")}`;
    }
    if (tbm.extractedInspector) {
      systemPrompt += `\n- 담당자: ${tbm.extractedInspector}`;
    }
    if (tbm.participants && tbm.participants.length > 0) {
      systemPrompt += `\n- 참석자: ${tbm.participants.join(", ")} (총 ${tbm.participants.length}명)`;
    }
    if (tbm.completenessScore) {
      const levelKo = tbm.completenessScore.level === "excellent" ? "우수" :
                      tbm.completenessScore.level === "adequate" ? "적정" : "미흡";
      systemPrompt += `\n- TBM 완성도: ${tbm.completenessScore.score}점 (${levelKo})`;
      if (tbm.completenessScore.missingTopics && tbm.completenessScore.missingTopics.length > 0) {
        systemPrompt += `\n- 누락 항목: ${tbm.completenessScore.missingTopics.join(", ")}`;
      }
    }
    if (tbm.summary) {
      // Truncate to avoid too long context
      const summaryPreview = tbm.summary.length > 300 ? tbm.summary.substring(0, 300) + "..." : tbm.summary;
      systemPrompt += `\n- 요약: ${summaryPreview}`;
    }
  }

  // Add photo analysis findings for three-way synthesis
  if (reportContext?.photoFindings) {
    const photo = reportContext.photoFindings;
    const violationCount = photo.violations.length;

    systemPrompt += `\n\n[현장 사진 분석 결과]`;
    systemPrompt += `\n- 분석 파일: ${photo.fileName}`;
    systemPrompt += `\n- 발견된 위반사항: ${violationCount}건`;

    if (photo.violations.length > 0) {
      for (const v of photo.violations) {
        const severityKo = v.severity === "error" ? "심각" : v.severity === "warn" ? "경고" : "정보";
        systemPrompt += `\n  - ${v.violation} (${severityKo}): ${v.evidence}`;
      }
    }

    if (photo.checklist && photo.checklist.length > 0) {
      systemPrompt += `\n- 사진 기반 체크리스트:`;
      for (const c of photo.checklist.slice(0, 10)) { // Limit to prevent token overflow
        systemPrompt += `\n  - ${c.nameKo}: ${c.value}`;
      }
      if (photo.checklist.length > 10) {
        systemPrompt += `\n  - ... 외 ${photo.checklist.length - 10}개 항목`;
      }
    }

    systemPrompt += `\n- 종합 위험도: ${photo.overallRisk || "미평가"}`;

    systemPrompt += `\n\n현장 사진 관련 질문에 답변할 때:
- 사진에서 발견된 위반사항과 문서 체크리스트를 비교하여 설명
- TBM 정보도 있으면 세 가지 소스(TBM/문서/사진)를 종합하여 답변
- "사진에서 보면..." 형식으로 구체적 증거를 인용`;
  }

  // Root cause analysis context for cross-source synthesis
  // Compute from issues if not already provided
  const rootCauseAnalysis = reportContext?.rootCauseAnalysis || (
    reportContext?.issues && reportContext.issues.length > 0
      ? (() => {
          const agg = aggregateRootCauses(reportContext.issues);
          return {
            summary: agg.summary,
            primaryRootCause: agg.primary ? {
              id: agg.primary.id,
              nameKo: agg.primary.nameKo,
              nameEn: agg.primary.nameEn,
            } : null,
            counts: agg.counts,
          };
        })()
      : null
  );

  if (rootCauseAnalysis && rootCauseAnalysis.primaryRootCause) {
    systemPrompt += `\n\n[근본 원인 분석 - 연구 기반]`;
    systemPrompt += `\n${rootCauseAnalysis.summary}`;
    systemPrompt += `\n주요 근본 원인: ${rootCauseAnalysis.primaryRootCause.nameKo} (${rootCauseAnalysis.primaryRootCause.nameEn})`;
    systemPrompt += `\n\n근본 원인 기반 종합 분석 시:`;
    systemPrompt += `\n- 문서에서 발견된 근본 원인이 TBM 기록에서도 확인되는지 분석`;
    systemPrompt += `\n- 같은 근본 원인이 사진 증거와도 일치하는지 확인`;
    systemPrompt += `\n- 예: 문서에서 "보호구 미제공(RC02)" 발견 → TBM에서 보호구 논의 누락 → 사진에서 보호구 미착용 = 세 자료 모두 RC02 확인`;
    systemPrompt += `\n- 근본 원인이 한 자료에서만 나타나면 "추가 확인 필요"로 표시`;
    systemPrompt += `\n- 시정조치 요청서 작성 시 근본 원인을 명시하여 재발 방지 조치 포함`;
  }

  // Three-way synthesis guide when all sources are available
  if (reportContext?.tbmContext && reportContext?.photoFindings && extracted) {
    systemPrompt += `\n\n[종합 분석 가이드]
현재 TBM 기록, 안전 점검표, 현장 사진이 모두 제공되었습니다.
사용자가 종합 분석을 요청하면:
1. TBM에서 논의된 위험요인이 점검표에 반영되었는지 확인
2. 점검표에 ✔로 표시된 항목이 현장 사진에서 실제로 이행되었는지 확인
3. 세 자료 간 불일치가 있으면 구체적으로 지적
4. "TBM→문서→현장" 순서로 안전 이행 과정을 추적하여 설명
5. 근본 원인이 식별되었다면 세 자료를 관통하는 근본 원인 패턴을 설명하고, 시정조치에 근본 원인 해소 방안을 포함`;
  }

  // Corrective action notice format instructions
  systemPrompt += `\n\n[시정조치 요청서 작성 안내]
사용자가 "시정조치 요청서를 작성해주세요"라고 하면 아래 형식으로 작성:

---
**시정조치 요청서**

**대상**: [점검자 이름 또는 "담당자"]
**현장**: [프로젝트명 또는 현장명]
**일시**: [오늘 날짜]
**문서**: [파일명]

**지적사항**:
[이슈 제목과 상세 내용을 명확하게 서술]

**관련 규정**:
[해당되는 산업안전보건법, KOSHA 가이드 조항 - 확실할 때만 인용]

**요구 조치**:
[구체적으로 무엇을 해야 하는지]

**시정 기한**: [심각→즉시, 경고→1일, 정보→3일]

**요청자**: 안전관리자
---

시정조치 요청서 작성 규칙:
- 비판단적 어조 사용 ("위반" 대신 "미흡", "부적합" 등)
- 규정 인용은 정확한 조항이 확실할 때만 (추측하지 말 것)
- 현장에서 바로 사용할 수 있는 실무적 문서로 작성
- 한국어로 작성`;

  return systemPrompt;
}

/**
 * Call Claude Sonnet 4.5 for chat
 */
async function callClaude(systemPrompt: string, messages: ClientMsg[]): Promise<string> {
  const anthropicMessages = messages.map(m => ({
    role: (m.role === "ai" ? "assistant" : "user") as "assistant" | "user",
    content: m.text ?? "",
  }));

  const response = await getAnthropic().messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1000,
    system: systemPrompt,
    messages: anthropicMessages,
    temperature: 0.3,
  });

  return response.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("\n")
    .trim() || "(응답이 비어있어요)";
}

/**
 * Call OpenAI GPT-5.1 as fallback
 */
async function callOpenAIChat(systemPrompt: string, messages: ClientMsg[]): Promise<string> {
  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map(m => ({
      role: (m.role === "ai" ? "assistant" : "user") as "assistant" | "user",
      content: m.text ?? "",
    })),
  ];

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-5.1",
    messages: openaiMessages,
    temperature: 0.3,
  });

  return completion.choices[0]?.message?.content?.trim() || "(응답이 비어있어요)";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = (body?.messages ?? []) as ClientMsg[];
    const reportContext = (body?.reportContext ?? null) as ReportContext | null;

    // Build system prompt with enriched context
    const systemPrompt = buildSystemPrompt(reportContext);

    // Try Claude first (primary), fall back to GPT-5.1
    let reply: string;

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        console.log("[Chat] Using Claude Sonnet 4.5...");
        reply = await callClaude(systemPrompt, messages);
      } catch (err) {
        console.warn("[Chat] Claude failed, falling back to GPT-5.1:", err);
        reply = await callOpenAIChat(systemPrompt, messages);
      }
    } else if (process.env.OPENAI_API_KEY) {
      console.log("[Chat] No Anthropic key, using GPT-5.1...");
      reply = await callOpenAIChat(systemPrompt, messages);
    } else {
      return NextResponse.json(
        { error: "No API key configured (ANTHROPIC_API_KEY or OPENAI_API_KEY)" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reply });
  } catch (e: any) {
    console.error("[/api/chat] error:", e);
    return NextResponse.json(
      { error: e?.message || "chat failed" },
      { status: 500 }
    );
  }
}
