// app/api/validate/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { validateDocument, type DocData, type ValidationIssue } from "@/lib/validator";
import { prisma } from "@/lib/db";
import { analyzeInspectorPatterns, patternWarningsToIssues } from "@/lib/patternAnalysis";
import { validateAgainstStructuredPlan } from "@/lib/structuredValidation";
import type { MasterSafetyPlan, StructuredValidationIssue } from "@/lib/masterPlanSchema";
import { calculateRiskLevel, riskCalculationToIssues } from "@/lib/riskMatrix";
import { analyzeCrossDocumentIssues, crossDocumentIssuesToValidationIssues } from "@/lib/crossDocumentAnalysis";
import { parseDocExtraction } from "@/lib/docSchema";
import { DOCUMENT_EXTRACTION_SCHEMA, type DocumentExtraction } from "@/lib/extractionSchema";
import { validateAgainstTBM } from "@/lib/tbmCrossValidation";
import {
  VERIFICATION_TOOLS,
  shouldVerifyExtraction,
  generateVerificationPrompt,
  reExtractField,
  verifyChecklistItem,
  checkSignaturePresence
} from "@/lib/verificationTools";
import { logger } from "@/lib/logger";

type Provider = "openai" | "claude" | "auto";

/**
 * Standardized error response builder
 * Ensures consistent error format across all endpoints
 */
function createErrorResponse(
  error: string,
  options: {
    fileName?: string;
    chatMessage?: string;
    status?: number;
    details?: string;
    solution?: string;
  } = {}
) {
  const {
    fileName = "Untitled",
    chatMessage,
    status = 400,
    details,
    solution
  } = options;

  return NextResponse.json(
    {
      error,
      fileName,
      ...(details && { details }),
      ...(solution && { solution }),
      issues: [],
      chat: [
        {
          role: "ai",
          text: chatMessage || error
        }
      ]
    },
    { status }
  );
}

// Helper to safely get OpenAI client
function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

// Helper to safely get Anthropic client
function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function buildSystemPrompt() {
  return `
너는 산업안전 서류 검증 AI다. 정해진 스키마에 맞춰 정보를 "있는 그대로" 추출하라.
판단하지 말고, 문서에 적힌 텍스트와 내용을 기반으로 값을 채워라.

출력은 반드시 "JSON만" 출력한다(설명/마크다운 금지).
스키마:
{
  "docType": "산업안전 점검표" | "위험성 평가 보고서" | "작업 전 안전점검표" | "TBM" | "unknown",
  "fields": {
    "점검일자": string|null,   // 예: 2024-05-20, 식별 불가시 null
    "현장명": string|null,
    "작업내용": string|null,
    "작업인원": string|null    // 예: "3명", "홍길동 외 2명" 등
  },
  "signature": {
    "담당": "present"|"missing"|"unknown", // 담당자/작업반장 등 실무자 서명
    "소장": "present"|"missing"|"unknown"  // 관리책임자/소장 서명
  },
  "inspectorName": string|null,  // 점검자/담당자 이름 (예: "김철수", "박안전")
  "riskLevel": "high"|"medium"|"low"|null,  // 문서에 표시된 위험도 수준
  "checklist": [  // 체크리스트 항목들 (있는 경우만)
    {
      "id": string,     // 항목 ID (fall_01, ppe_03 등)
      "category": string,  // 분류 (추락예방, 보호구, 전기안전 등)
      "nameKo": string,    // 한국어 항목명
      "value": "✔"|"✖"|"N/A"|null  // 체크 상태
    }
  ],
  "chat": [
     {"role":"ai", "text": "문서 요약 및 특이사항 한줄 코멘트"}
  ]
}

체크리스트 ID 규칙:
- fall_01: 고소작업, fall_02: 추락방호장치, fall_03: 안전난간
- ppe_01: 안전모착용, ppe_03: 안전대착용
- fire_01: 화기작업, fire_02: 소화기비치
- conf_01: 밀폐공간작업, conf_02: 산소농도측정, conf_03: 환기조치
- exc_01: 굴착작업, exc_02: 흙막이설치, exc_03: 탈출사다리
- elec_02: 전기작업, elec_03: 잠금장치

주의:
- "issues" 필드는 생성하지 마라. (검증은 별도 로직으로 수행함)
- 서명란이 비어있으면 "missing"으로 표시하라.
- 내용을 찾을 수 없으면 null 또는 "unknown"을 사용하라.
- 사용자가 "프로젝트 규칙" 또는 "마스터 플랜"을 제공한 경우(아래 Context), 그 규칙에 위배되는 사항이 있다면 특이사항(chat)에 언급하라.
- chat 메시지는 비판단적(non-judgmental) 어조를 사용하라: "불일치가 존재함", "기록 누락됨" 등으로 표현하고, "위험함", "잘못됨" 같은 판단 표현은 피하라.
`;
}

function buildPhotoValidationPrompt(contextText?: string) {
  let prompt = `
너는 건설 현장 안전 검사관 AI다. 업로드된 현장 사진을 분석하여 안전 규정 위반 사항을 식별하라.

출력은 반드시 "JSON만" 출력한다(설명/마크다운 금지).
스키마:
{
  "docType": "현장 사진",
  "fields": {
    "점검일자": null,
    "현장명": null,
    "작업내용": string,  // 사진에서 관찰된 작업 설명 (예: "고소작업", "전기작업", "굴착작업")
    "작업인원": string|null  // 사진에 보이는 작업자 수 (예: "2명", "확인 불가")
  },
  "photoAnalysis": {
    "workType": string,  // 작업 유형 (예: "고소작업", "밀폐공간작업", "전기작업")
    "workersVisible": number,  // 확인된 작업자 수
    "location": string,  // 작업 위치 설명 (예: "건물 외벽 3층", "지하 공간", "옥상")
    "conditions": string[]  // 관찰된 현장 상황 (예: ["높이 3m 이상", "밀폐공간", "우천"])
  },
  "safetyViolations": [  // 발견된 안전 위반 사항
    {
      "id": string,  // 위반 ID (fall_helmet, ppe_vest 등)
      "category": string,  // 분류 (개인보호구, 안전시설, 작업환경)
      "violation": string,  // 위반 내용 (예: "안전모 미착용", "안전난간 미설치")
      "severity": "high"|"medium"|"low",  // 위험도
      "location": string,  // 사진 내 위치 (예: "화면 중앙 작업자", "왼쪽 상단 영역")
      "evidence": string  // 구체적 근거 (예: "노란색 작업복 착용 작업자의 머리에 안전모가 보이지 않음")
    }
  ],
  "safetyCompliance": [  // 준수 사항
    {
      "item": string,  // 준수 항목 (예: "안전조끼 착용", "안전대 체결")
      "evidence": string  // 준수 근거
    }
  ],
  "checklist": [  // 안전 체크리스트 (사진 기반 자동 평가)
    {
      "id": string,  // 항목 ID
      "category": string,  // 분류
      "nameKo": string,  // 항목명
      "value": "✔"|"✖"|"N/A"  // 평가 결과
    }
  ],
  "chat": [
    {"role":"ai", "text": "사진 분석 요약 및 주요 발견 사항"}
  ]
}

분석 가이드라인:

1. 개인보호구(PPE) 확인:
   - 안전모(ppe_01): 필수 착용, 색상/형태 확인
   - 안전조끼(ppe_02): 야광/고가시성 조끼 착용 여부
   - 안전대(ppe_03): 고소작업 시 필수, 걸이 연결 확인
   - 안전화(ppe_04): 작업화 착용 여부
   - 안전장갑(ppe_05): 작업 유형에 맞는 장갑 착용

2. 안전시설 확인:
   - 추락방지: 안전난간(fall_03), 추락방호망(fall_02)
   - 전기안전: 절연장갑, 잠금장치(elec_03)
   - 화기작업: 소화기 비치(fire_02), 불꽃 감시자
   - 밀폐공간: 환기장치(conf_03), 산소농도계(conf_02)
   - 굴착작업: 흙막이(exc_02), 탈출사다리(exc_03)

3. 작업환경 평가:
   - 작업 높이: 2m 이상 = 고소작업(fall_01)
   - 밀폐공간: 환기 불량 공간 = 밀폐공간작업(conf_01)
   - 전기 노출: 감전 위험 = 전기작업(elec_02)
   - 굴착 깊이: 1.5m 이상 = 굴착작업(exc_01)

4. 위반 심각도 기준:
   - high: 즉시 생명 위협 (추락, 감전, 질식 등)
   - medium: 중대 부상 가능 (낙하물, 화상 등)
   - low: 경미한 부상 가능 (찰과상, 타박상 등)

주의사항:
- 사진에서 **명확히 확인 가능한 사항만** 보고하라
- 불확실한 경우 "확인 불가" 또는 "N/A"로 표시
- 위반 사항은 구체적 근거와 위치를 함께 기술
- 비판단적 어조 유지: "～가 관찰됨", "～확인되지 않음"
`;

  if (contextText) {
    prompt += `\n\n[PROJECT CONTEXT / MASTER SAFETY PLAN]\n다음은 이 현장의 마스터 안전 계획이다. 사진 분석 시 이 규칙을 기준으로 위반 여부를 판단하라:\n${contextText}`;
  }

  return prompt;
}

function safeJsonParse(text: string) {
  const trimmed = (text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // JSON만 달라고 해도 앞뒤로 말이 붙는 경우 대비
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

function sanitizeDocData(raw: unknown) {
  return parseDocExtraction(raw);
}

// ✅ NEW: Extraction with Structured Outputs (guaranteed valid JSON)
async function callOpenAIStructured(opts: {
  pdfText?: string;
  pageImages?: string[] | null;
  contextText?: string
}): Promise<DocumentExtraction> {
  let sysPrompt = buildSystemPrompt();

  if (opts.contextText) {
    sysPrompt += `\n\n[PROJECT CONTEXT / MASTER PLAN]\n다음은 이 현장의 마스터 안전 계획이다. 이 내용을 참고하여 위반 사항이나 불일치 점이 있으면 지적하라:\n${opts.contextText}`;
  }

  // Add confidence tracking instruction
  sysPrompt += `\n\n중요: extractionConfidence 필드에 추출 신뢰도를 반드시 포함하세요:
- overall: "high" (모든 필드 명확), "medium" (일부 불확실), "low" (여러 필드 불확실)
- uncertainFields: 추출이 불확실한 필드 목록 (예: ["점검일자", "점검자"])`;

  // Build content array
  const content: any[] = [];
  content.push({ type: "text", text: sysPrompt });

  if (opts.pdfText && opts.pdfText.trim().length >= 50) {
    content.push({ type: "text", text: `추출 텍스트:\n${opts.pdfText}` });
  }

  if (opts.pageImages?.length) {
    for (const img of opts.pageImages) {
      content.push({
        type: "image_url",
        image_url: {
          url: img,
          detail: "high"
        }
      });
    }
  }

  console.log("[Structured Extraction] Calling OpenAI with structured outputs...");

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: content
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: DOCUMENT_EXTRACTION_SCHEMA
    },
    max_tokens: 1500,
    temperature: 0,
  });

  const responseText = response.choices[0]?.message?.content ?? "{}";
  const extraction: DocumentExtraction = JSON.parse(responseText);

  console.log("[Structured Extraction] Success! Confidence:", extraction.extractionConfidence.overall);

  return extraction;
}

// Keep old function for Claude fallback
async function callOpenAI(opts: { pdfText?: string; pageImages?: string[] | null; contextText?: string }) {
  let sysPrompt = buildSystemPrompt();

  if (opts.contextText) {
    sysPrompt += `\n\n[PROJECT CONTEXT / MASTER PLAN]\n다음은 이 현장의 마스터 안전 계획이다. 이 내용을 참고하여 위반 사항이나 불일치 점이 있으면 지적하라:\n${opts.contextText}`;
  }

  const content: any[] = [];
  content.push({ type: "text", text: sysPrompt });

  if (opts.pdfText && opts.pdfText.trim().length >= 50) {
    content.push({ type: "text", text: `추출 텍스트:\n${opts.pdfText}` });
  }

  if (opts.pageImages?.length) {
    for (const img of opts.pageImages) {
      content.push({
        type: "image_url",
        image_url: {
          url: img,
          detail: "high"
        }
      });
    }
  }

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: content
      }
    ],
    max_tokens: 1500,
    temperature: 0,
  });

  const responseText = response.choices[0]?.message?.content ?? "";
  return safeJsonParse(responseText);
}

async function callClaude(opts: { pdfText?: string; pageImages?: string[] | null; contextText?: string }) {
  const content: any[] = [];

  // 시스템 프롬프트는 첫 텍스트 블록에 함께 넣는 방식으로 간단히 처리
  let sysPrompt = buildSystemPrompt();
  if (opts.contextText) {
    sysPrompt += `\n\n[PROJECT CONTEXT / MASTER PLAN]\n다음은 이 현장의 마스터 안전 계획이다. 이 내용을 참고하여 위반 사항이나 불일치 점이 있으면 지적하라:\n${opts.contextText}`;
  }
  content.push({ type: "text", text: sysPrompt });

  if (opts.pdfText && opts.pdfText.trim().length >= 50) {
    content.push({ type: "text", text: `추출 텍스트:\n${opts.pdfText}` });
  }

  if (opts.pageImages?.length) {
    for (const img of opts.pageImages) {
      // data:image/jpeg;base64,... 에서 base64만 분리
      const base64 = img.split(",")[1] ?? "";
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: base64 },
      });
    }
  }

  const msg = await getAnthropic().messages.create({
    model: "claude-sonnet-4-5-20250929", // 너 계정에서 가능한 모델로 바꿔도 됨
    max_tokens: 1500,
    messages: [{ role: "user", content }],
  });

  // Claude 응답은 content 배열로 오니까 text만 합치기
  const outText =
    msg.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n") ?? "";

  return safeJsonParse(outText);
}

// ✅ NEW: Verification step with self-correction tools
async function verifyExtraction(
  extraction: DocumentExtraction,
  pdfText: string,
  pageImages?: string[] | null
): Promise<DocumentExtraction> {
  // Check if verification is needed
  if (!shouldVerifyExtraction(extraction)) {
    console.log("[Verification] High confidence - skipping verification");
    return extraction;
  }

  // TODO: Implement verification correction logic
  // Currently, verification calls are made but results are discarded (wasteful).
  // Until correction step is implemented, skip verification to avoid:
  // - Extra latency (2+ additional API calls)
  // - Token cost (GPT-4o-mini calls with no benefit)
  // - No accuracy improvement (results not applied)
  console.log("[Verification] Low confidence detected, but verification disabled (correction not implemented)");
  console.log("[Verification] Uncertain fields:", extraction.extractionConfidence.uncertainFields);
  return extraction;

  /* DISABLED: Verification calls without correction (wasteful)
  console.log("[Verification] Low confidence - running verification tools");
  console.log("[Verification] Uncertain fields:", extraction.extractionConfidence.uncertainFields);

  // Build verification messages
  const verificationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "너는 문서 추출 품질 검증 전문가다. 추출 결과를 검토하고 필요하면 재추출 도구를 사용하여 누락된 정보를 보완하라. 모든 도구 사용 후 '검증 완료'라고 응답하라."
    },
    {
      role: "user",
      content: generateVerificationPrompt(extraction)
    }
  ];

  try {
    // Call GPT-4o-mini with verification tools
    const verification = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini", // Cheaper model for verification
      messages: verificationMessages,
      tools: VERIFICATION_TOOLS,
      tool_choice: "auto",
      temperature: 0,
      max_tokens: 1000
    });

    const message = verification.choices[0]?.message;

    // Handle tool calls
    if (message?.tool_calls && message.tool_calls.length > 0) {
      console.log(`[Verification] AI calling ${message.tool_calls.length} tool(s)`);

      verificationMessages.push(message);

      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        const { name, arguments: argsStr } = (toolCall as any).function;
        const args = JSON.parse(argsStr);

        console.log(`[Verification] Tool: ${name}`, args);

        let toolResult = "";

        switch (name) {
          case "re_extract_field":
            toolResult = reExtractField(args.fieldName, args.reason, pdfText, pageImages ?? undefined);
            // TODO: In production, actually re-extract from document
            break;

          case "verify_checklist_item":
            toolResult = verifyChecklistItem(args.itemId, args.currentValue, pdfText, pageImages ?? undefined);
            // TODO: In production, actually verify from document
            break;

          case "check_signature_presence":
            toolResult = checkSignaturePresence(args.signatureType, pdfText, pageImages ?? undefined);
            // TODO: In production, actually check document
            break;

          default:
            toolResult = `알 수 없는 도구: ${name}`;
        }

        verificationMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult
        });
      }

      // Get final verification response
      const finalVerification = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: verificationMessages,
        temperature: 0,
        max_tokens: 500
      });

      const verificationResult = finalVerification.choices[0]?.message?.content || "";
      console.log("[Verification] Result:", verificationResult);

      // TODO: Parse verification result and apply corrections to extraction
      // For now, return original extraction (tools are informational)
    } else {
      console.log("[Verification] No tool calls needed - extraction confirmed good");
    }

    return extraction;
  } catch (error) {
    console.warn("[Verification] Failed, using original extraction:", error);
    return extraction;
  }
  */
}

export async function POST(req: Request) {
  // Parse request body once at the start - body can only be consumed once
  let requestBody: any;
  try {
    requestBody = await req.json();
  } catch (parseError) {
    return createErrorResponse("잘못된 요청 형식입니다", {
      status: 400,
      chatMessage: "요청 데이터를 파싱할 수 없습니다. 올바른 JSON 형식인지 확인해주세요."
    });
  }

  const { provider, fileName, pdfText, pageImages, projectId, documentType, tempContextText, latestTBM } = requestBody;

  try {

    // VALIDATION: Check if document has sufficient content
    const hasText = pdfText && pdfText.trim().length >= 50;
    const hasImages = pageImages && pageImages.length > 0;

    if (!hasText && !hasImages) {
      return NextResponse.json(
        {
          error: "문서에 내용이 없거나 읽을 수 없습니다",
          fileName: fileName ?? "Untitled",
          issues: [],
          chat: [
            {
              role: "ai",
              text: "업로드된 문서가 비어있거나 내용을 읽을 수 없습니다. 올바른 안전 점검 문서를 업로드해주세요."
            }
          ]
        },
        { status: 400 }
      );
    }

    const p: Provider = (provider ?? "auto") as Provider;

    const normalizedText = (pdfText ?? "").replace(/\s+/g, " ").trim();
    const looksLikeGeneratedReport =
      normalizedText.includes("검증 요약") ||
      normalizedText.includes("AI 분석") ||
      normalizedText.includes("AI 안전도우미") ||
      normalizedText.includes("스마트 안전지킴이") ||
      normalizedText.includes("검증 결과");

    if (looksLikeGeneratedReport) {
      return NextResponse.json(
        {
          error: "검증 결과 리포트는 업로드 대상이 아닙니다",
          fileName: fileName ?? "Untitled",
          issues: [],
          chat: [
            {
              role: "ai",
              text: "이 파일은 검증 결과 리포트로 보입니다. 원본 안전 점검 문서를 업로드해주세요."
            }
          ]
        },
        { status: 400 }
      );
    }

    // Fetch Project Context if projectId is present, or use temporary context
    let contextText = "";
    let masterPlan: MasterSafetyPlan | null = null;
    let projectIsStructured = false;

    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId }
      });
      if (project) {
        // Legacy free-text context
        if (project.contextText) {
          contextText = project.contextText;
        }
        // New structured master plan
        if (project.isStructured && project.masterPlanJson) {
          try {
            masterPlan = JSON.parse(project.masterPlanJson) as MasterSafetyPlan;
            projectIsStructured = true;
          } catch (e) {
            console.error("Failed to parse master plan JSON:", e);
          }
        }
      }
    } else if (tempContextText) {
      // Use temporary master doc context for non-project validation
      contextText = tempContextText;
    }

    // ✅ PRE-CLASSIFICATION: For images with auto-detect, determine if it's a document or site photo
    console.log("[Route] Document type received:", documentType);
    console.log("[Route] Is SITE_PHOTO?", documentType === "SITE_PHOTO");
    console.log("[Route] Has text?", hasText, "Has images?", hasImages);

    // Auto-detect for images: classify before extraction
    let effectiveDocumentType = documentType;

    if (documentType === null && hasImages && !hasText) {
      // Image-only upload with auto-detect - need to classify first
      console.log("\n========== IMAGE PRE-CLASSIFICATION ==========");

      try {
        const classificationPrompt = `You are analyzing an image to determine its type. Look at the image and classify it into ONE of these categories:

1. "SCANNED_DOCUMENT" - A scanned or photographed safety document, checklist, form, or paperwork. Has visible text, tables, checkboxes, signatures, or form fields.

2. "SITE_PHOTO" - A photograph of a construction site, work area, or workers. Shows actual physical environment, people working, equipment, or site conditions. NOT a photo of a document.

Respond with ONLY a JSON object:
{
  "classification": "SCANNED_DOCUMENT" or "SITE_PHOTO",
  "confidence": "high" or "medium" or "low",
  "reason": "brief explanation"
}`;

        const content: any[] = [
          { type: "text", text: classificationPrompt },
          { type: "image_url", image_url: { url: pageImages[0], detail: "low" } } // Use low detail for speed
        ];

        const classifyResponse = await getOpenAI().chat.completions.create({
          model: "gpt-4o-mini", // Use mini for speed and cost
          messages: [{ role: "user", content }],
          max_tokens: 150,
          temperature: 0,
        });

        const classifyResult = safeJsonParse(classifyResponse.choices[0]?.message?.content ?? "");
        console.log("[Pre-Classification] Result:", classifyResult);

        if (classifyResult?.classification === "SITE_PHOTO") {
          console.log("[Pre-Classification] Detected as SITE_PHOTO, routing to photo validation");
          effectiveDocumentType = "SITE_PHOTO";
        } else {
          console.log("[Pre-Classification] Detected as SCANNED_DOCUMENT, continuing with document extraction");
        }
      } catch (classifyError) {
        console.warn("[Pre-Classification] Failed, defaulting to document extraction:", classifyError);
        // Continue with document extraction as fallback
      }
    }

    // ✅ PHOTO VALIDATION: Special handling for site photos
    if (effectiveDocumentType === "SITE_PHOTO") {
      console.log("\n========== PHOTO VALIDATION MODE ==========");

      if (!hasImages) {
        return NextResponse.json(
          {
            error: "현장 사진 검증에는 이미지가 필요합니다",
            fileName: fileName ?? "Untitled",
            issues: [],
            chat: [
              {
                role: "ai",
                text: "현장 사진을 업로드해주세요. 이미지 파일이 필요합니다."
              }
            ]
          },
          { status: 400 }
        );
      }

      // Use photo validation prompt
      const photoPrompt = buildPhotoValidationPrompt(contextText);

      let photoAnalysis: any;
      try {
        // Try OpenAI GPT-4o (has vision capabilities)
        if (p === "openai" || p === "auto") {
          const content: any[] = [
            { type: "text", text: photoPrompt }
          ];

          // Add images
          for (const img of pageImages) {
            content.push({
              type: "image_url",
              image_url: { url: img, detail: "high" }
            });
          }

          const response = await getOpenAI().chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content }],
            max_tokens: 2000,
            temperature: 0,
          });

          photoAnalysis = safeJsonParse(response.choices[0]?.message?.content ?? "");
        } else {
          // Use Claude for vision analysis
          const content: any[] = [
            { type: "text", text: photoPrompt }
          ];

          for (const img of pageImages) {
            const base64 = img.split(",")[1] ?? "";
            content.push({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            });
          }

          const msg = await getAnthropic().messages.create({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 2000,
            messages: [{ role: "user", content }],
          });

          const outText = msg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n") ?? "";

          photoAnalysis = safeJsonParse(outText);
        }

        console.log("[Photo Analysis] Complete:", JSON.stringify(photoAnalysis, null, 2));

        // Convert photo analysis to standard format
        const extraction: DocumentExtraction = {
          docType: "현장 사진",
          fields: photoAnalysis.fields || {},
          signature: { 담당: "unknown", 소장: "unknown" },
          inspectorName: null,
          riskLevel: null,
          checklist: photoAnalysis.checklist || [],
          chat: photoAnalysis.chat || [
            { role: "ai", text: "현장 사진 분석이 완료되었습니다." }
          ],
          extractionConfidence: {
            overall: "high",
            uncertainFields: []
          }
        };

        // Convert violations to issues
        const photoIssues: ValidationIssue[] = [];

        if (photoAnalysis.safetyViolations) {
          for (const violation of photoAnalysis.safetyViolations) {
            photoIssues.push({
              severity: violation.severity === "high" ? "error" : violation.severity === "medium" ? "warn" : "info",
              title: violation.violation,
              message: `${violation.evidence}\n\n위치: ${violation.location}`,
              ruleId: `photo_${violation.id}`,
              path: `사진분석.${violation.category}`,
              isAIFixable: false, // Photo issues are informational - can't edit an image
            });
          }
        }

        // Store in database
        const createdReport = await prisma.report.create({
          data: {
            fileName,
            docDataJson: JSON.stringify(extraction),
            issuesJson: JSON.stringify(photoIssues),
            chatJson: JSON.stringify(extraction.chat),
            projectId: projectId ?? null,
            documentType: "SITE_PHOTO",
          }
        });

        return NextResponse.json({
          id: createdReport.id,
          fileName,
          issues: photoIssues,
          chat: extraction.chat,
          extracted: extraction,
          documentType: "SITE_PHOTO",
        });
      } catch (e: any) {
        console.error("[Photo Analysis] Error:", e);
        console.error("[Photo Analysis] Error details:", {
          message: e.message,
          stack: e.stack,
          documentType,
          hasImages,
        });
        return NextResponse.json(
          {
            error: `사진 분석 중 오류가 발생했습니다: ${e.message}`,
            fileName,
            issues: [],
            chat: [
              {
                role: "ai",
                text: `사진 분석에 실패했습니다.\n\n오류: ${e.message}\n\n참고: 스캔된 문서 이미지를 업로드하시는 경우, 문서 종류 선택 시 "현장 사진"이 아닌 실제 문서 유형(예: "산업안전 점검표")을 선택해주세요.`
              }
            ]
          },
          { status: 500 }
        );
      }
    }

    // ✅ Phase 1: Structured Extraction (Guaranteed Valid JSON)
    console.log("\n========== PHASE 1: STRUCTURED EXTRACTION ==========");
    let extraction: DocumentExtraction;

    if (p === "openai" || p === "auto") {
      // Use structured outputs (OpenAI only for now)
      try {
        extraction = await callOpenAIStructured({ pdfText, pageImages, contextText });
      } catch (e) {
        console.warn("[Extraction] Structured extraction failed, falling back to Claude:", e);
        // Fallback to Claude (without structured outputs)
        const result = await callClaude({ pdfText, pageImages, contextText });
        const sanitized = sanitizeDocData(result);
        if ("error" in sanitized) {
          return NextResponse.json({ error: sanitized.error }, { status: 400 });
        }
        // Map to DocumentExtraction format
        extraction = {
          ...sanitized.data,
          extractionConfidence: {
            overall: "medium",
            uncertainFields: []
          }
        } as DocumentExtraction;
      }
    } else {
      // Claude path (no structured outputs yet)
      const result = await callClaude({ pdfText, pageImages, contextText });
      const sanitized = sanitizeDocData(result);
      if ("error" in sanitized) {
        return NextResponse.json({ error: sanitized.error }, { status: 400 });
      }
      extraction = {
        ...sanitized.data,
        extractionConfidence: {
          overall: "medium",
          uncertainFields: []
        }
      } as DocumentExtraction;
    }

    console.log("[Phase 1] Extraction complete. Confidence:", extraction.extractionConfidence.overall);

    // ✅ Phase 2: Verification (Conditional, Self-Correcting)
    console.log("\n========== PHASE 2: VERIFICATION ==========");
    const verified = await verifyExtraction(extraction, pdfText ?? "", pageImages);
    console.log("[Phase 2] Verification complete");

    // Convert DocumentExtraction to DocData format for validation
    const extracted: any = {
      docType: verified.docType,
      fields: verified.fields,
      signature: verified.signature,
      inspectorName: verified.inspectorName,
      riskLevel: verified.riskLevel,
      checklist: verified.checklist,
      chat: verified.chat
    };

    // VALIDATION: Check if document is safety-related
    // If docType is "unknown" and no safety-related fields are found, reject the document
    const isSafetyDocument =
      extracted.docType !== "unknown" ||
      (extracted.fields?.점검일자 ?? false) ||
      (extracted.fields?.현장명 ?? false) ||
      (extracted.fields?.작업내용 ?? false) ||
      (extracted.signature?.담당 && extracted.signature.담당 !== "unknown") ||
      (extracted.signature?.소장 && extracted.signature.소장 !== "unknown") ||
      (extracted.checklist?.length ?? 0) > 0;

    if (!isSafetyDocument) {
      // ✅ Better error message for images
      const wasImage = pageImages && pageImages.length > 0;
      const errorMessage = wasImage
        ? "업로드된 이미지에서 안전 점검 문서 내용을 찾을 수 없습니다. 이미지가 선명하고 문서 전체가 잘 보이는지 확인해주세요. 흐릿하거나 일부만 촬영된 경우 다시 촬영해주세요."
        : "업로드된 문서는 안전 점검 관련 문서가 아닌 것으로 보입니다. 산업안전 점검표, 위험성 평가 보고서, TBM 결과 등 안전 점검 문서를 업로드해주세요.";

      return NextResponse.json(
        {
          error: "안전 점검 문서가 아닌 것으로 판단됩니다",
          fileName: fileName ?? "Untitled",
          issues: [],
          chat: [
            {
              role: "ai",
              text: errorMessage
            }
          ]
        },
        { status: 400 }
      );
    }

    const validationIssues = validateDocument(extracted);
    const documentTypeMap: Record<string, DocData["docType"]> = {
      SAFETY_CHECKLIST: "산업안전 점검표",
      RISK_ASSESSMENT: "위험성 평가 보고서",
      PRE_WORK_CHECKLIST: "작업 전 안전점검표",
      TBM: "TBM",
      OTHER: "unknown",
    };
    // Use effectiveDocumentType for mismatch checking (handles auto-detected types)
    const selectedDocType = documentTypeMap[effectiveDocumentType as keyof typeof documentTypeMap];
    const mismatchIssues: ValidationIssue[] = [];

    // Only check for mismatch if user explicitly selected a type (not auto-detected)
    if (documentType && documentType === effectiveDocumentType) {
      if (selectedDocType === "unknown") {
        if (extracted.docType !== "unknown") {
          mismatchIssues.push({
            severity: "warn",
            title: "문서 유형 선택이 실제 내용과 다릅니다",
            message: `선택하신 문서 유형은 "기타 문서"이지만, AI 분석 결과는 "${extracted.docType}"로 인식되었습니다. 올바른 유형을 선택했는지 확인해주세요.`,
            ruleId: "user_doc_type_mismatch",
          });
        }
      } else if (selectedDocType && extracted.docType !== "unknown" && extracted.docType !== selectedDocType) {
        mismatchIssues.push({
          severity: "warn",
          title: "문서 유형 선택이 실제 내용과 다릅니다",
          message: `선택하신 문서 유형은 "${selectedDocType}"이지만, AI 분석 결과는 "${extracted.docType}"로 인식되었습니다. 문서 유형을 다시 선택해주세요.`,
          ruleId: "user_doc_type_mismatch",
        });
      } else if (selectedDocType && extracted.docType === "unknown") {
        mismatchIssues.push({
          severity: "info",
          title: "문서 유형 확인이 필요합니다",
          message: "선택하신 문서 유형이 있지만 문서 내용에서 유형을 확정하기 어렵습니다. 문서가 올바른지 확인해주세요.",
          ruleId: "user_doc_type_uncertain",
        });
      }
    }

    // Stage 3: Structured Master Plan Validation
    let structuredIssues: StructuredValidationIssue[] = [];
    if (masterPlan && projectIsStructured) {
      try {
        structuredIssues = validateAgainstStructuredPlan(extracted, masterPlan);
      } catch (e) {
        console.warn("Structured validation failed:", e);
        // Non-critical, continue without structured validation
      }
    }

    // Stage 3: Risk Matrix Calculation
    let riskIssues: typeof validationIssues = [];
    try {
      const riskCalculation = calculateRiskLevel(extracted);
      riskIssues = riskCalculationToIssues(riskCalculation);
    } catch (e) {
      console.warn("Risk calculation failed:", e);
      // Non-critical, continue without risk analysis
    }

    const reportId = crypto.randomUUID();

    // Stage 4: Pattern Analysis - Check for suspicious patterns
    let patternIssues: typeof validationIssues = [];
    if (extracted.inspectorName) {
      try {
        const patternWarnings = await analyzeInspectorPatterns(
          extracted.inspectorName,
          projectId ?? undefined
        );
        patternIssues = patternWarningsToIssues(patternWarnings);
      } catch (e) {
        console.warn("Pattern analysis failed:", e);
        // Non-critical, continue without pattern warnings
      }
    }

    // Stage 3: Cross-Document Analysis
    let crossDocIssues: typeof validationIssues = [];
    if (projectId) {
      try {
        const crossIssues = await analyzeCrossDocumentIssues(projectId, reportId);
        crossDocIssues = crossDocumentIssuesToValidationIssues(crossIssues);
      } catch (e) {
        console.warn("Cross-document analysis failed:", e);
        // Non-critical, continue without cross-document analysis
      }
    }

    // Stage 3d: TBM Cross-Validation
    let tbmIssues: typeof validationIssues = [];
    if (latestTBM && latestTBM.extractedHazards && latestTBM.extractedHazards.length > 0) {
      try {
        console.log("[Stage 3d] Running TBM cross-validation...");
        tbmIssues = validateAgainstTBM(extracted, latestTBM);
        console.log(`[Stage 3d] TBM validation found ${tbmIssues.length} issues`);
      } catch (e) {
        console.warn("[Stage 3d] TBM validation failed:", e);
        // Non-critical, continue without TBM validation
      }
    }

    // Merge all issues: validation + structured + risk + pattern + cross-document + TBM analysis
    const allIssues = [...validationIssues, ...mismatchIssues, ...structuredIssues, ...riskIssues, ...patternIssues, ...crossDocIssues, ...tbmIssues].map(issue => ({
      ...issue,
      id: crypto.randomUUID()
    }));
    // --- DB SAVE ---
    // Save the result to the database for history (including Stage 4 fields)
    const extractedChat = Array.isArray((extracted as { chat?: unknown }).chat)
      ? JSON.stringify((extracted as { chat?: unknown[] }).chat)
      : null;

    let savedReport = { id: reportId }; // Default ID if save fails

    try {
      await prisma.report.create({
        data: {
          id: reportId,
          fileName: fileName ?? "Untitled",
          docDataJson: JSON.stringify(extracted),
          issuesJson: JSON.stringify(allIssues),
          chatJson: extractedChat,
          projectId: projectId ?? null,
          documentType: effectiveDocumentType ?? null, // Use effectiveDocumentType for auto-detected types
          // Stage 4: Save inspector name and checklist for pattern analysis
          inspectorName: extracted.inspectorName ?? null,
          checklistJson: extracted.checklist ? JSON.stringify(extracted.checklist) : null,
        }
      });
    } catch (e) {
      console.warn("History save failed (likely read-only DB on Vercel):", e);
      // Continue without failing the user response
    }

    // Stage 5: Risk Signals - Format output with non-judgmental language
    const riskSignals = allIssues
      .filter(issue => issue.ruleId?.startsWith("pattern_"))
      .map(issue => ({
        type: issue.ruleId,
        message: issue.message,
      }));

    const finalResult = {
      ...extracted,
      issues: allIssues,
      riskSignals,
    };

    return NextResponse.json({
      fileName,
      ...finalResult,
      reportId: savedReport.id
    });
  } catch (e: any) {
    logger.error("Validation Error:", e);
    const msg = e?.message ?? "validate failed";
    // Use fileName from requestBody (already parsed at start)
    const errorFileName = requestBody?.fileName;

    // API Key missing errors
    if (msg.includes("API_KEY is not set")) {
      return createErrorResponse(
        "API Key 설정이 필요합니다",
        {
          fileName: errorFileName,
          details: msg,
          solution: ".env.local 파일에 API Key를 추가해주세요.",
          status: 500,
          chatMessage: "서버 설정 오류로 인해 검증을 수행할 수 없습니다. 관리자에게 문의해주세요."
        }
      );
    }

    // Generic server error
    return createErrorResponse(
      "검증 중 오류가 발생했습니다",
      {
        fileName: errorFileName,
        details: msg,
        status: 500,
        chatMessage: `검증 처리 중 예상치 못한 오류가 발생했습니다.\n\n오류 내용: ${msg}\n\n문제가 계속되면 관리자에게 문의해주세요.`
      }
    );
  }
}
