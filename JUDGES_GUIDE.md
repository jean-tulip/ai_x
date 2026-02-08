# 심사위원 가이드: 스마트 안전지킴이

본 가이드는 심사위원분들이 스마트 안전지킴이 시스템을 실행하고 평가하기 위한 단계별 안내서입니다.

---

## 사전 요구사항

애플리케이션 실행 전 다음 사항을 확인해 주세요:

1. **Node.js** (v18 이상)
   - 다운로드: https://nodejs.org/
   - 확인 명령어: `node --version`

2. **API 키** (최소 1개 필요)
   - OpenAI API 키: https://platform.openai.com/api-keys
   - Anthropic API 키: https://console.anthropic.com/

---

## 빠른 시작 (5분 소요)

### 1단계: 의존성 설치

```bash
cd ai_x
npm install
```

### 2단계: 환경 설정

루트 폴더에 `.env.local` 파일을 생성하세요:

```env
# AI API 키 (최소 1개 필요)
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here

# 데이터베이스 (로컬 테스트용 SQLite)
DATABASE_URL="file:./dev.db"
```

### 3단계: 데이터베이스 초기화

```bash
npx prisma db push
```

### 4단계: 애플리케이션 시작

```bash
npm run dev
```

브라우저에서 열기: **http://localhost:3000**

---

## 테스트 문서 위치

모든 테스트 문서는 `test-documents/` 폴더에 검증 단계별로 정리되어 있습니다:

```
test-documents/
├── 1-valid/                    # 정상 문서 (모든 검증 통과)
├── 2-stage1-format/            # 형식 오류 (필수 필드 누락)
├── 3-stage2-logic/             # 논리 위반 (안전 규칙 위반)
├── 5-stage4-patterns/          # 패턴 감지 (의심스러운 행동)
├── 7-edge-cases/               # 엣지 케이스 및 특수 상황
├── 8-quality-tests/            # 이미지 품질 테스트
└── tbm-voice/                  # TBM 음성 녹음 파일
```

---

## 권장 데모 시나리오

### 시나리오 1: 정상 문서 (기준선)

**파일:** `test-documents/1-valid/valid-safety-checklist.pdf`

**단계:**
1. 파일 업로드
2. AI 분석 대기 (2-5초)
3. 모든 검증이 녹색 체크표시로 통과하는지 확인

**예상 결과:** 이슈 없음

---

### 시나리오 2: 서명 누락 (Stage 1)

**파일:** `test-documents/2-stage1-format/missing-both-signatures.pdf`

**단계:**
1. 파일 업로드
2. 검증 결과 확인

**예상 결과:**
- 오류: 담당자 서명 누락
- 오류: 관리감독자 서명 누락

---

### 시나리오 3: 안전 위반 - 고소작업 (Stage 2)

**파일:** `test-documents/3-stage2-logic/missing-ppe-for-height-work.pdf`

**단계:**
1. 파일 업로드
2. 감지된 안전 위반 사항 확인

**예상 결과:**
- 오류: 고소작업 시 안전대 미착용
- KOSHA 안전 규정 참조 표시
- 조치 가이드 제공

---

### 시나리오 4: 화재 안전 위반 (Stage 2)

**파일:** `test-documents/3-stage2-logic/fire-work-no-extinguisher.pdf`

**단계:**
1. 파일 업로드
2. 화재 안전 위반 확인

**예상 결과:**
- 오류: 화기작업(용접) 시 소화기 미비치
- 화재 예방 규정 인용

---

### 시나리오 5: 패턴 감지 - 항상 체크 (Stage 4)

**파일:** `test-documents/5-stage4-patterns/inspector-kim-day*.pdf` 5개 전체

**단계:**
1. 새 프로젝트 생성 (문서 그룹화용, 선택사항)
2. `inspector-kim-day1.pdf`부터 `inspector-kim-day5.pdf`까지 순서대로 업로드
3. 5번째 문서 업로드 후 패턴 경고 확인

**예상 결과:**
- 경고: "항상 체크" 패턴 감지
- 점검자 "김철수"가 모든 문서에서 95% 이상 체크율 표시
- 형식적 점검(고무도장) 행동 가능성 제시

---

### 시나리오 6: 복사-붙여넣기 패턴 감지 (Stage 4)

**파일:** `test-documents/5-stage4-patterns/inspector-lee-copypaste*.pdf` 3개 전체

**단계:**
1. 3개의 복사-붙여넣기 문서를 순서대로 업로드
2. 패턴 분석 결과 확인

**예상 결과:**
- 경고: 여러 보고서에서 동일한 작업내용 감지
- 복사-붙여넣기 행동 제시

---

### 시나리오 7: 이미지 품질 테스트

**파일:**
- 양호: `test-documents/1-valid/valid-classic.jpg`
- 불량: `test-documents/8-quality-tests/quality-blurry.jpg`

**단계:**
1. 양호한 품질의 이미지 먼저 업로드 - 정상 처리 확인
2. 흐린 이미지 업로드 - 품질 경고 확인

**예상 결과:**
- 양호 이미지: 정상 처리
- 불량 이미지: 품질 경고 메시지 표시

---

### 시나리오 8: TBM 녹음 (선택사항)

**파일:** `test-documents/tbm-voice/tbm 녹음.m4a` (또는 다른 .m4a 파일)

**단계:**
1. 안전 문서 먼저 업로드
2. "TBM 녹음" 섹션 클릭
3. 오디오 파일 업로드 또는 새로 녹음
4. 전사 및 분석 대기

**예상 결과:**
- 오디오가 한국어 텍스트로 전사됨
- 완성도 점수 계산 (7개 기준)
- 참여도 점수 표시 (참여형 vs 일방적 전달)
- 문서 체크리스트와 교차 검증

---

## 주요 기능 관찰 포인트

### 1. 5단계 검증 프레임워크
- Stage 1: 형식 검증 (필수 필드 누락, 서명 누락)
- Stage 2: 논리 검증 (22개 안전 규칙, 한국 법령 참조)
- Stage 3: 교차 문서 분석 (위험 매트릭스, 마스터 플랜 검증)
- Stage 4: 패턴 감지 (항상 체크, 복사-붙여넣기 행동)
- Stage 5: AI 맥락 검토 (암묵적 안전 우려사항)

### 2. 근본원인 분류
- 각 이슈에 연구 기반 근본원인 코드 태깅 (RC01-RC07)
- 한국 건설안전 연구 기반 (Kim & Chi 2020, Hwang et al. 2023)

### 3. 추락 위험 우선순위
- 고소작업 키워드 자동 감지
- 추락 관련 이슈를 "오류" 심각도로 상향
- 건설 사망사고의 71%가 추락사고라는 연구 기반

### 4. 이중 언어 지원
- 모든 메시지 한국어(기본) 및 영어 제공
- 한국 안전 법령 참조 (산업안전보건법, KOSHA GUIDE)

### 5. PDF 보고서 생성
- 분석 후 "PDF 내보내기" 버튼 클릭
- 모든 발견사항이 포함된 종합 보고서 생성

### 6. AI 채팅
- 분석된 문서에 대해 질문 가능
- 예시: "위험요인은 무엇인가요?" 또는 "What hazards were identified?"

---

## 문제 해결

### "API 키 오류"
- `.env.local`에 유효한 API 키가 있는지 확인
- 키 추가 후 개발 서버 재시작

### "데이터베이스 오류"
- `npx prisma db push` 실행하여 데이터베이스 초기화
- 손상된 경우 `prisma/dev.db` 삭제 후 재실행

### "포트 3000 사용 중"
- 기존 프로세스 종료: `npx kill-port 3000`
- 또는 다른 포트 사용: `npm run dev -- -p 3001`

### 처리 속도 느림
- 첫 번째 요청은 더 오래 걸릴 수 있음 (모델 초기화)
- 이후 요청은 더 빠름 (2-5초)

---

## 기술 사양

| 구성요소 | 기술 |
|----------|------|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript |
| 데이터베이스 | SQLite (로컬) / PostgreSQL (프로덕션) |
| AI 모델 | OpenAI GPT-5.1, Anthropic Claude Sonnet 4.5 |
| PDF 처리 | PDF.js |
| 음성 전사 | OpenAI Whisper |

---

## 추가 문의

시스템에 대한 기술적 문의사항은 다음을 참조해 주세요:
- `README.md` - 전체 프로젝트 문서
- `test-documents/README.md` - 상세 테스트 문서 설명

---

**Team Luna | GNU RISE AI+X 2026**
