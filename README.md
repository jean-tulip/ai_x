# 🛡️ Smart Safety Guardian (AI Document Verification)

**Smart Safety Guardian** is an AI-powered safety document verification system designed for Korean construction sites. It uses a **5-stage validation framework** to detect missing fields, safety violations, risk inconsistencies, fraudulent patterns, and cross-document contradictions.

![Project Status](https://img.shields.io/badge/Status-Active-green)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Prisma](https://img.shields.io/badge/Prisma-5-blue)
![Competition](https://img.shields.io/badge/GNU_RISE_AI+X-2026-orange)

[🇰🇷 Korean Version (한국어)](README.ko.md)

---

## 🎯 Competition: GNU RISE AI+X 2026

**Team**: Luna
**Demo Date**: February 8, 2026
**Goal**: Automate safety document validation to enhance data integrity and improve compliance in Korean construction sites.

---

## ✨ Key Features

### 🔍 5-Stage Validation Framework

#### **Stage 1: Format Validation**
- Detects missing required fields (date, site name, signatures)
- Checks checklist completeness
- Validates signature presence (inspector & supervisor)

#### **Stage 2: Intra-Document Logic** ⭐ Enhanced
- **22 comprehensive rules** across 4 categories:
  - 9 Safety Violations (e.g., height work without harness)
  - 5 Logical Contradictions (e.g., no work but equipment checked)
  - 6 Suspicious Patterns (e.g., excessive N/A responses)
  - 2 Completeness Checks (e.g., missing helmet checks)
- **Korean Safety Law References**: Every violation cites specific regulations (산업안전보건법, KOSHA GUIDE)
- **Actionable Guidance**: Each issue includes recommended actions
- **Research-Based Root Cause Tagging** ⭐ NEW
  - Links each validation issue to research-identified root causes (RC01-RC07)
  - Based on Kim & Chi (2020) and Hwang et al. (2023) Korean construction safety research
  - Categories: 교육 부족, 보호구 미제공, 안전조치 미이행, 불안전한 상태, 안전 불감증, 절차 이탈, 안전계획 부재
  - Enables evidence-based analysis and cross-source synthesis

#### **Stage 3: Cross-Document Consistency** ⭐ NEW - 3 Parallel Systems
1. **Structured Master Safety Plan Validation**
   - Validates against JSON-based master safety plans
   - Checks weather limits, work requirements, personnel qualifications
   - Deterministic validation (~10ms, no AI needed)

2. **Risk Matrix Calculation**
   - Calculates objective risk scores (0-100) based on KOSHA standards
   - Factors: High-risk work types, safety violations, signatures, checklist quality
   - Detects mismatch between calculated and documented risk levels
   - Example: Calculated=High (55 pts) vs Documented=Low → Flags inconsistency
   - **Fall Hazard Priority System** ⭐ NEW
     - Based on research showing 71% of fatal construction accidents are falls
     - Automatic height work detection using Korean/English keywords (비계, 고소작업, scaffold, etc.)
     - Escalates fall-related issues to "error" severity when height work detected
     - Cross-source detection: TBM mentions + document content + photo analysis

3. **Cross-Document Analysis**
   - Timeline gap detection (flags 5+ day inspection gaps)
   - Contradiction detection (conflicting risk assessments for same site)
   - Repetition pattern detection (copy-paste behavior, identical checklists)
   - Analyzes last 30 days of reports per project

#### **Stage 4: Behavioral Pattern Analysis** ⭐ Enhanced
- **Name Normalization**: Recognizes "김철수" = "김 철수" as same person
- **Time-Weighted Analysis**: Recent behavior weighted higher (30-day window)
- **Pattern Severity Scoring**: Cumulative risk assessment (Critical: 80+, High: 50-79)
- **Configurable Thresholds**: STRICT/DEFAULT/LENIENT modes for different scenarios
- Detects: Always-check patterns, copy-paste behavior, rapid completion

#### **Stage 5: Risk Signal Guidance + Contextual Safety Review** ⭐ Enhanced
- Non-judgmental phrasing (e.g., "Inconsistency detected" not "This is unsafe")
- Purple-coded pattern warnings (distinct from red errors/orange warnings)
- Bilingual messages (Korean + English)
- **NEW: AI Contextual Safety Review**
  - Analyzes work context to identify safety concerns not covered by checklists
  - Examples: Outdoor electrical work → weather risk, Night height work → lighting concerns
  - Uses Claude Sonnet 4.5 with GPT-5.1 fallback for nuanced reasoning
  - Categories: weather_risk, lone_worker, missing_precaution, environmental, temporal, regulatory_gap

---

### 🎤 TBM (Toolbox Meeting) Recording & Analysis ⭐ Enhanced

#### **Audio Recording & Transcription**
- Record safety meetings directly in the app
- Whisper-powered transcription (Korean language optimized)
- Automatic summarization with GPT-5.1

#### **Completeness Scoring**
- **7-point evaluation criteria**:
  - Work description, hazard identification, control measures
  - PPE discussion, role assignment, emergency plan, worker participation
- **Scoring levels**: 우수 (85-100), 적정 (60-84), 미흡 (0-59)
- Missing topics and improvement suggestions displayed

#### **Engagement Quality Scoring** ⭐ NEW
- **Research-backed analysis** based on PMC study showing participatory TBMs are more effective
- **5 engagement factors analyzed**:
  - Questions asked (indicates discussion vs lecture)
  - Multiple speakers detected (turn-taking patterns)
  - Worker participation markers (acknowledgments, responses)
  - Adequate meeting duration (word count analysis)
  - Personalized address (name mentions for engagement)
- **Scoring levels**: 높음/참여형 (75+), 보통 (50-74), 낮음/일방적 전달 (0-49)
- Generates improvement suggestions for low-engagement TBMs
- Displayed in TBM timeline with color-coded badges
- Included in PDF export with factor breakdown

#### **AI-Powered TBM Cross-Validation**
- Validates checklist against TBM discussion
- Detects hazards mentioned in TBM but unchecked in documents
- Claude Sonnet 4.5 with GPT-5.1 fallback for semantic matching
- **Fall hazard priority**: Automatically escalates severity when height work detected in TBM
- Example: TBM mentions "fire hazard" but 소화기 marked ✖ → Warning

---

### 📸 Photo Cross-Validation ⭐ NEW

#### **Stage 3d: Photo-Document Cross-Validation**
- Upload site photos alongside safety documents
- AI analyzes photos to verify checklist consistency
- **Detects mismatches**:
  - Checklist says "harness worn" but photo shows no harness
  - Checklist says "fire extinguisher present" but not visible in photo
- Uses Claude Vision for photo analysis
- Generates specific validation issues with photo evidence

---

## 🚀 Advanced Capabilities

### 📋 Project Context Awareness
- Upload a **Master Safety Plan (PDF or JSON)** for each construction site
- AI validates daily reports against site-specific rules
- Example: Master Plan says "Stop work if wind > 10m/s" → Daily report showing 12m/s flags violation

### 🤖 AI Chat with Report Context ⭐ Enhanced
- **MCP-style tool calling**: AI assistant can query document data, checklist status, and risk assessments
- **TBM Context Integration**: Chat understands TBM discussions, hazards, and completeness scores
- **Semantic search**: Ask questions like "What hazards were identified?" and get specific answers
- **Multi-turn conversation**: Follow-up questions maintain full context

### 📄 Comprehensive PDF Reports ⭐ Enhanced
- **Executive summary** with AI-generated overview
- **Detailed findings** organized by severity (Critical/Warning/Info)
- **Extracted document data**: Fields, signatures, inspector info
- **Checklist visualization**: All items with status indicators
- **TBM summary**: Work type, hazards, participants, completeness score
- **Cross-validation results**: Photo-document mismatches highlighted
- **Bilingual support**: Korean primary with section headers

### 💾 Data Persistence & History
- All validation reports saved to database
- Inspector pattern tracking across multiple reports
- Project-level analytics and timeline summaries

### 🎨 Modern UI
- Resizable split-pane interface (Document Viewer | Analysis Panel)
- Real-time validation results with issue categorization
- Risk score dashboard with factor breakdown
- Mobile responsive (tabbed interface on small screens)

### 🌐 Bilingual Support
- All validation messages in Korean (primary) and English
- Code comments and documentation in both languages
- Designed for Korean safety regulations (KOSHA GUIDE, 산업안전보건법)

---

## 🛠️ Tech Stack

### Core Framework
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (Dev) / Postgres (Production)
- **ORM**: Prisma v5

### AI & Document Processing
- **AI Models**: OpenAI GPT-5.1 / GPT-4o / Anthropic Claude Sonnet 4.5
- **PDF Engine**: PDF.js (multi-page analysis)
- **Vision Processing**: Base64 image encoding for scanned documents
- **Audio Processing**: OpenAI Whisper for TBM transcription

### Validation Engine
- **Rule Engine**: 22 deterministic rules (Stage 1-2)
- **Structured Validation**: JSON schema validation (Stage 3)
- **Risk Calculation**: KOSHA-compliant matrix (Stage 3)
- **Pattern Analysis**: Statistical behavioral detection (Stage 4)
- **Cross-Document**: Database-driven analysis (Stage 3)
- **Photo Validation**: Claude Vision-powered cross-validation (Stage 3d)
- **TBM Validation**: AI-powered semantic matching (Stage 3d)
- **Contextual Review**: AI reasoning for implicit safety concerns (Stage 5)

---

## 🚀 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/jean-tulip/ai_x.git
cd ai_x
npm install
```

### 2. Environment Setup
Create a `.env.local` file:
```env
# AI API Keys (at least one required)
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...

# Database (Local SQLite)
DATABASE_URL="file:./dev.db"
```

### 3. Initialize Database
```bash
# Generate Prisma Client and push schema
npx prisma db push
```

### 4. Run Locally
```bash
npm run dev
# Open http://localhost:3000
```

---

## 📊 Demo Highlights

### What Makes This System Unique?

1. **Integrity Verification** 🕵️
   - Detects copy-paste behavior across reports
   - Identifies "always check" patterns by specific inspectors
   - Flags timeline gaps and suspicious repetition

2. **Objective Risk Scoring** 📈
   - KOSHA-compliant risk matrix
   - Transparent calculation showing all risk factors
   - Detects mismatch between reality and documentation

3. **Structured Master Plans** 📋
   - JSON-based safety plans (no subjective AI interpretation)
   - Deterministic validation (fast, reproducible)
   - Covers weather limits, work requirements, personnel qualifications

4. **Bilingual Korean/English** 🌐
   - All messages in both languages
   - Korean safety law references
   - Designed for Korean construction industry

### Performance Metrics
- **AI Extraction**: 2-5 seconds (unchanged)
- **Stage 1-2 Validation**: ~20ms
- **Stage 3 Systems**: +65-215ms total
- **Stage 4 Pattern Analysis**: ~100ms
- **Total Processing**: ~2.5-5.5 seconds

---

## 📂 Project Structure

### Core Application
```
src/app/
├── page.tsx                    # Main controller (state management)
├── api/
│   ├── validate/route.ts       # AI validation + all 5 stages
│   ├── projects/route.ts       # Project context management
│   └── history/route.ts        # Report history API
```

### Components
```
src/components/
├── Header.tsx                  # Project selector
├── layout/                     # Resizable split-pane
├── viewer/                     # PDF/Image rendering
└── analysis/                   # Results display + issue list
```

### Validation Engine
```
src/lib/
├── validator.ts                # Stage 1-2: 22 rules
├── structuredValidation.ts     # Stage 3: Structured plan checks
├── riskMatrix.ts               # Stage 3: Risk scoring
├── crossDocumentAnalysis.ts    # Stage 3: Multi-report analysis
├── tbmCrossValidation.ts       # Stage 3d: TBM cross-validation
├── photoCrossValidation.ts     # Stage 3d: Photo cross-validation
├── contextualSafetyReview.ts   # Stage 5: AI contextual review
├── patternAnalysis.ts          # Stage 4: Behavioral patterns
├── validationConfig.ts         # Configurable thresholds
├── chatTools.ts                # MCP-style chat tools
├── pdfExport.ts                # Comprehensive PDF export
├── masterPlanSchema.ts         # Structured plan schema
├── rootCauseMapping.ts         # Research-based root cause classification (NEW)
├── fallHazardPriority.ts       # Fall hazard detection & escalation (NEW)
└── tbmEngagementScoring.ts     # TBM engagement quality analysis (NEW)
```

### Database
```
prisma/
├── schema.prisma               # Report & Project models
└── dev.db                      # SQLite database (local)
```

---

## 🧪 Testing Without Real Documents

Since real construction safety documents may not be available, we provide:

### Option 1: Interactive HTML Tool
Open `tools/generate-test-document.html` in a browser:
- 4 presets: Valid, Violation, Contradiction, N/A Pattern
- Click-to-edit checklist items
- Save as PDF or screenshot

### Option 2: Synthetic Test Data
Use `src/lib/testData.ts` functions:
```typescript
generateValidDocument()           // Clean document
generateContradictoryDocument()   // Logic errors
generateAlwaysCheckDocument()     // Pattern fraud
generateInconsistentRiskDocument() // Risk mismatch
```

### Option 3: Browser Console Testing
Open browser console on the app and paste:
```javascript
fetch('/api/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'auto',
    fileName: 'test.pdf',
    pdfText: JSON.stringify({ /* mock DocData */ }),
    projectId: null
  })
}).then(r => r.json()).then(console.log);
```

Full testing strategy: See `테스트_전략.md`

---

## ☁️ Deployment (Vercel)

### Production Requirements
1. **Switch to Postgres**:
   - Create Vercel Postgres database
   - Update `prisma/schema.prisma`: Change `provider = "sqlite"` to `provider = "postgresql"`
   - Set `DATABASE_URL` in Vercel environment variables

2. **Set API Keys**:
   - `OPENAI_API_KEY` (required)
   - `ANTHROPIC_API_KEY` (required)

3. **Deploy**:
   ```bash
   git push origin main
   # Connect repository to Vercel
   ```

> **Note**: SQLite does not persist in serverless environments. Postgres is required for production.

---

## 🤝 Contribution Guide

This project follows a **Fork & Pull** workflow.

### Syncing with Upstream
```bash
git fetch upstream
git merge upstream/main
```

### Making Changes
1. Create feature branch: `git checkout -b feat/your-feature`
2. Make changes and commit: `git commit -m "feat: Add feature"`
3. Push to your fork: `git push origin feat/your-feature`
4. Open Pull Request to main repository

---

## 🎓 Learning Resources

### For Korean Construction Safety
- **산업안전보건법** (Occupational Safety and Health Act)
- **KOSHA GUIDE** (Korea Occupational Safety and Health Agency)
- **산업안전보건기준에 관한 규칙** (Enforcement Rules)

### For Developers
- Next.js 14 App Router documentation
- Prisma ORM documentation
- OpenAI API / Anthropic API documentation
- Tailwind CSS documentation

---

## 📊 Validation Statistics

### Rule Coverage
- **Stage 1**: 5 format checks
- **Stage 2**: 22 logic rules (4 categories) + root cause tagging
- **Stage 3a**: 8 structured validation functions
- **Stage 3b**: 4-factor risk assessment + fall hazard priority
- **Stage 3c**: 3 cross-document analyses
- **Stage 3d**: TBM + Photo cross-validation (AI-powered)
- **Stage 4**: 5 pattern detection algorithms
- **Stage 5**: Contextual safety review (6 concern categories)
- **TBM**: 7 completeness criteria + 5 engagement factors

**Total**: 55+ validation rules across 5 stages

### Research Integration
- **Root Causes**: 7 research-identified categories (RC01-RC07)
- **Fall Priority**: Based on 71% fatal accident statistic
- **Engagement Scoring**: Based on PMC participatory training research

### Code Metrics
- **Total Lines**: ~4,000 lines (validation engine + TBM + PDF export)
- **Modules**: 15 major validation files
- **Test Coverage**: Synthetic data available for all stages

---

## 🏆 Competition Advantages

1. **Integrity Verification** - Unique capability detecting copy-paste and pattern manipulation
2. **Objective Risk Scoring** - KOSHA-compliant, transparent calculations
3. **5-Stage Framework** - Comprehensive validation beyond simple field checks
4. **TBM Integration** - Record, transcribe, score, and cross-validate safety meetings
5. **Photo Cross-Validation** - AI vision verifies physical safety measures match documentation
6. **Contextual AI Review** - Identifies implicit safety concerns from work context
7. **Comprehensive PDF Reports** - Professional safety reports with all validation data
8. **Intelligent Chat** - MCP-style tools for querying document data and TBM context
9. **Production Ready** - 100% complete, fully functional system
10. **Bilingual Support** - Korean primary with English translations
11. **Research-Based Root Causes** ⭐ NEW - Links issues to academic research (Kim & Chi 2020, Hwang et al. 2023)
12. **Fall Hazard Priority** ⭐ NEW - Automatic escalation based on 71% fatal accident research
13. **TBM Engagement Scoring** ⭐ NEW - Detects one-way lectures vs participatory meetings

---

## 📝 License

This project is developed for the **GNU RISE AI+X Competition 2026**.

---

## 👥 Team

**Team Luna**
GNU RISE Program

**Demo Date**: February 8, 2026

---

**Built with ❤️ for safer construction sites in Korea**
