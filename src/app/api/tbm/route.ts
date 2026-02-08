export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { analyzeEngagement, getEngagementLevelKo } from "@/lib/tbmEngagementScoring";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function safeText(v: unknown) {
  return typeof v === "string" ? v : "";
}

function buildTBMSystemPrompt() {
  return `
너는 건설/산업현장의 TBM(작업 전 대화) 기록을 분석하는 AI다.

사용자가 녹음한 대화를 전사한 텍스트를 바탕으로 아래 형식으로 요약해라.
한국어로, 현장 실무자가 바로 쓸 수 있게 간결하고 구조적으로.

**중요: 반드시 유효한 JSON으로만 출력해라. 주석(//), 설명, 코드블록 사용 금지.**

스키마:
{
  "workType": "string",  // 작업 종류 (예: "비계 조립", "용접 작업", "외벽 도장")
  "extractedHazards": ["추락", "화재", ...],  // 논의된 위험요인 (핵심 키워드만)
  "extractedInspector": "string|null",  // 담당자 이름 (명확히 언급된 경우만)
  "participants": ["이름1", "이름2", ...],  // 참석자 이름들
  "work_overview": "string",
  "risks": ["string", "... (최대 5)"],
  "controls": ["string", "... (risks와 가능한 1:1 대응)"],
  "ppe": ["string", "..."],
  "roles_contact": ["string", "..."],
  "action_items": [{"task":"string","owner":"string|null","due":"string|null"}],
  "unclear_points": ["string", "..."],
  "cautions": ["string", "... (최대 5)"],
  "completenessScore": {
    "score": number,  // 0-100 점수
    "level": "excellent" | "adequate" | "insufficient",  // 우수/적정/미흡
    "breakdown": {
      "workDescription": boolean,       // 1. 작업 내용 설명
      "hazardIdentification": boolean,  // 2. 위험요인 식별
      "controlMeasures": boolean,       // 3. 안전 조치/통제 방안
      "ppeDiscussion": boolean,         // 4. 보호구 논의
      "roleAssignment": boolean,        // 5. 역할 배정/담당자 지정
      "emergencyPlan": boolean,         // 6. 비상 상황 대응 계획
      "workerParticipation": boolean    // 7. 작업자 참여/질문
    },
    "missingTopics": ["string", ...],  // 누락된 주요 항목들
    "suggestions": ["string", ...]     // 개선 제안
  }
}

필드 설명:
- workType: 구체적인 작업명 (예: "비계 조립", "콘크리트 타설", "용접 작업")
- extractedHazards: 핵심 위험요인만 (예: ["추락", "낙하물", "화재"])
- extractedInspector: 담당자/책임자 이름 (명시되지 않으면 null)
- participants: 참석자 이름 리스트

completenessScore 평가 기준:
- breakdown의 7개 항목 중 논의된 항목 수를 기준으로 점수 산정
- 7/7 = excellent (85-100점): 모든 필수 항목 논의됨
- 5-6/7 = adequate (60-84점): 대부분의 항목 논의됨
- ≤4/7 = insufficient (0-59점): 핵심 항목 누락됨
- missingTopics: 누락된 항목을 한국어로 명시 (예: "비상 대응 계획", "역할 배정")
- suggestions: 개선을 위한 구체적 제안 (예: "화재 발생 시 대피 경로를 공유하세요")

프로젝트 컨텍스트 활용:
- 사용자가 [프로젝트 컨텍스트]를 제공한 경우, 해당 정보를 참고하여:
  * 프로젝트의 주요 위험요인이 TBM에서 언급되었는지 확인
  * 필수 보호구가 체크되었는지 검토
  * 핵심 절차가 논의되었는지 검토
  * 누락된 중요 항목이 있다면 "unclear_points"에 명시
- 프로젝트 컨텍스트와 TBM 내용이 불일치하면 객관적으로 기록

주의:
- 사실에 근거해 작성하고, 추측은 "추정"으로 표시.
- 개인 비난/판단 금지. 비판단적 어조 사용 ("확인 필요", "누락됨" 등).
- 프로젝트 컨텍스트는 참고 자료일 뿐, TBM 전사본 내용이 최우선.
`.trim();
}


function normalizeAudioFile(file: File) {
  const type = (file.type || "").toLowerCase();

  let ext = "webm";
  if (type.includes("x-m4a") || type.includes("m4a") || type.includes("mp4")) ext = "m4a";
  else if (type.includes("mpeg") || type.includes("mp3")) ext = "mp3";
  else if (type.includes("wav")) ext = "wav";
  else if (type.includes("ogg") || type.includes("oga")) ext = "ogg";
  else if (type.includes("webm")) ext = "webm";

  // Whisper가 포맷 힌트를 더 잘 잡게 파일명/확장자를 맞춰서 새 File로 감쌈
  const fixedName = `tbm.${ext}`;
  return new File([file], fixedName, { type: file.type || "application/octet-stream" });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const projectId = safeText(form.get("projectId"));

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ error: "audio 파일이 필요합니다." }, { status: 400 });
    }

    console.log("[TBM] audio:", { name: audio.name, type: audio.type, size: audio.size });

    if (audio.size < 8000) {
      return NextResponse.json({ error: "오디오 파일이 너무 작거나 비어있습니다." }, { status: 400 });
    }

    // MIME은 환경마다 제멋대로라서 "차단"보다 "경고 후 진행"이 안정적
    const type = (audio.type || "").toLowerCase();
    const allowed = new Set([
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/x-m4a",
      "audio/aac",
      "video/mp4",
    ]);

    if (type && !allowed.has(type)) {
      console.warn("[TBM] unknown mime type, proceed anyway:", type);
    }

    const client = getOpenAI();
    const normalizedAudio = normalizeAudioFile(audio);

    // 1) Transcribe (Whisper)
    console.log("[TBM] step=transcribe start");
    const transcriptRes = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: normalizedAudio,
      language: "ko",
    });
    console.log("[TBM] step=transcribe done");

    const transcript = safeText((transcriptRes as any).text);
    if (!transcript.trim()) {
      return NextResponse.json({ error: "전사 결과가 비어있습니다." }, { status: 500 });
    }

    // 2a) Analyze engagement quality (Brief #3)
    console.log("[TBM] step=engagement analysis start");
    const engagementScore = analyzeEngagement(transcript);
    console.log("[TBM] step=engagement analysis done, score:", engagementScore.score, "level:", engagementScore.level);

    // 2) Load project context if projectId provided
    let contextInfo = "";
    if (projectId) {
      try {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: {
            name: true,
            description: true,
            contextText: true,
            masterPlanJson: true,
            isStructured: true,
          },
        });

        if (project) {
          contextInfo = `\n\n[프로젝트 컨텍스트]\n프로젝트명: ${project.name}`;

          if (project.description) {
            contextInfo += `\n프로젝트 설명: ${project.description}`;
          }

          // Use structured master plan if available
          if (project.isStructured && project.masterPlanJson) {
            try {
              const plan = JSON.parse(project.masterPlanJson);
              if (plan.risks && Array.isArray(plan.risks) && plan.risks.length > 0) {
                const riskNames = plan.risks.map((r: any) => r.name || r.description).filter(Boolean);
                if (riskNames.length > 0) {
                  contextInfo += `\n주요 위험요인: ${riskNames.join(", ")}`;
                }
              }
              if (plan.requiredPPE && Array.isArray(plan.requiredPPE) && plan.requiredPPE.length > 0) {
                contextInfo += `\n필수 보호구: ${plan.requiredPPE.join(", ")}`;
              }
              if (plan.criticalProcedures && Array.isArray(plan.criticalProcedures) && plan.criticalProcedures.length > 0) {
                contextInfo += `\n핵심 절차: ${plan.criticalProcedures.map((p: any) => p.name || p.description).filter(Boolean).join(", ")}`;
              }
            } catch (e) {
              console.warn("[TBM] Failed to parse structured plan:", e);
            }
          }
          // Fallback to legacy context text
          else if (project.contextText && project.contextText.trim()) {
            contextInfo += `\n마스터 안전 계획:\n${project.contextText.substring(0, 500)}`;
          }

          console.log("[TBM] Using project context:", contextInfo.substring(0, 200) + "...");
        } else {
          console.warn("[TBM] Project not found:", projectId);
        }
      } catch (e) {
        console.error("[TBM] Error loading project context:", e);
      }
    }

    // 3) Summarize with context
    console.log("[TBM] step=summarize start");
    const summaryRes = await client.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: buildTBMSystemPrompt() },
        {
          role: "user",
          content: `다음은 TBM 녹음 전사본이다. 이를 요약해라.\n\n[TRANSCRIPT]\n${transcript}${contextInfo}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    console.log("[TBM] step=summarize done");

    const raw = summaryRes.choices[0]?.message?.content ?? "{}";

    let parsed: any = null;
    try {
      // Remove comments from JSON before parsing
      const cleanedJson = raw.replace(/\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
      parsed = JSON.parse(cleanedJson);
    } catch (e) {
      console.error("[TBM] JSON parse error:", e);
      console.error("[TBM] Raw response:", raw);
      // fallback: 파싱 실패 시 raw 그대로 사용
    }

    const summary =
      parsed
        ? [
            `1) 오늘 작업 개요\n- ${parsed.work_overview ?? ""}`,
            `\n2) 주요 위험요인\n${(parsed.risks ?? []).map((x: string) => `- ${x}`).join("\n")}`,
            `\n3) 예방/통제 조치\n${(parsed.controls ?? []).map((x: string) => `- ${x}`).join("\n")}`,
            `\n4) PPE/장비 체크\n${(parsed.ppe ?? []).map((x: string) => `- ${x}`).join("\n")}`,
            `\n5) 역할/담당 및 연락 체계\n${(parsed.roles_contact ?? []).map((x: string) => `- ${x}`).join("\n")}`,
            `\n6) 결정사항/액션아이템\n${(parsed.action_items ?? []).map((it: any) =>
              `- ${it.task} (담당: ${it.owner ?? "미상"}, 기한: ${it.due ?? "미상"})`
            ).join("\n")}`,
            `\n7) 누락/불명확한 부분\n${(parsed.unclear_points ?? []).map((x: string) => `- ${x}`).join("\n")}`,
            `\n8) 주의사항\n${(parsed.cautions ?? []).map((x: string) => `- ${x}`).join("\n")}`,
          ].join("\n")
        : raw;

    const cautions = parsed?.cautions ?? [];

    return NextResponse.json({
      transcript,
      summary,
      cautions,
      workType: parsed?.workType || null,
      extractedHazards: parsed?.extractedHazards || [],
      extractedInspector: parsed?.extractedInspector || null,
      participants: parsed?.participants || [],
      completenessScore: parsed?.completenessScore || null,
      // Brief #3: Engagement quality scoring
      engagementScore: {
        score: engagementScore.score,
        level: engagementScore.level,
        levelKo: getEngagementLevelKo(engagementScore.level),
        factors: engagementScore.factors,
        suggestions: engagementScore.suggestions,
      },
    });
  } catch (e: any) {
    console.error("/api/tbm error raw:", e);
    const msg =
      e?.response?.data?.error?.message ||
      e?.error?.message ||
      e?.message ||
      "TBM 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
