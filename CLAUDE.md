# Smart Safety Guardian - Claude Code Context

## Project Overview
AI-powered safety document validation system for Korean construction sites.
- **Team**: Luna (GNU RISE AI+X Competition)
- **Demo Date**: February 8, 2026
- **Deadline**: February 7, 2026

## What This System Does
Validates the *reliability and consistency* of safety inspection records.
**Critical framing**: We do NOT judge whether a site is safe. We verify whether the *documentation* is complete, consistent, and shows evidence of real inspection activity.

## Core Validation Framework (5 Stages)

### Stage 1: Format Validation ✅ IMPLEMENTED
- Missing required fields (date, task name, inspector signature)
- Checklist values present (✔/✖/N/A)
- Signature verification (담당/소장)
- **Location**: `src/lib/validator.ts:632` - `validateDocument()`
- **Triggers**: Always runs on every document

### Stage 2: Intra-Checklist Logic ✅ IMPLEMENTED
- IF-THEN consistency within a single document (25+ rules)
- Safety violation detection: fall protection, fire safety, confined space, excavation, electrical
- Logical contradiction detection
- Example: "Not working at height" ✔ BUT "Fall protection PPE" ✔ → contradiction
- **Location**: `src/lib/validator.ts:473` - `validateIntraChecklistLogic()`
- **Triggers**: When `checklist` array exists in document

### Stage 3: Cross-Document Consistency ✅ IMPLEMENTED (3 sub-modules)

#### 3a. Structured Master Plan Validation
- Validates document against project's structured Master Safety Plan
- Checks required risks, PPE, procedures
- **Location**: `src/lib/structuredValidation.ts`
- **Triggers**: When project has `isStructured=true` and `masterPlanJson` exists
- **API Call**: `validate/route.ts:354-363`

#### 3b. Risk Matrix Calculation
- Calculates risk level from checklist items
- Identifies risk mismatches (claimed low-risk but high-risk items present)
- **Location**: `src/lib/riskMatrix.ts`
- **Triggers**: Always runs when checklist exists
- **API Call**: `validate/route.ts:365-373`

#### 3c. Cross-Document Analysis
- Multiple documents about same work should tell same story
- Example: Risk assessment says "high-risk" but pre-work checklist says "no issues"
- **Location**: `src/lib/crossDocumentAnalysis.ts`
- **Triggers**: When `projectId` exists (project context available)
- **API Call**: `validate/route.ts:392-402`

### Stage 4: Behavioral Pattern Analysis ✅ IMPLEMENTED
- Detecting "always ✔" patterns (>95% check rate)
- Copy-paste behavior (3+ identical descriptions)
- Rapid completion detection (5+ reports in 30 minutes)
- Inspector-specific patterns across multiple reports
- **Location**: `src/lib/patternAnalysis.ts`
- **Triggers**: When `inspectorName` exists in document
- **API Call**: `validate/route.ts:377-390`
- **Requires**: Database history (5+ reports for meaningful analysis)

### Stage 5: Risk Signal Guidance ✅ IMPLEMENTED
- Non-judgmental alerts based on rule violations
- Phrasing: "Inconsistency exists" NOT "This is unsafe"
- Includes KOSHA/MOEL reference links
- Actionable recommendations
- **Location**: `src/lib/riskMatrix.ts`, `src/app/api/validate/route.ts:429-435`
- **Triggers**: When pattern issues exist (Stage 4 results)

---

## Stage Trigger Summary

| Stage | Always Runs? | Condition | Notes |
|-------|-------------|-----------|-------|
| Stage 1 | ✅ Yes | None | Format validation always runs |
| Stage 2 | ⚠️ Conditional | `checklist.length > 0` | Most documents have checklists |
| Stage 3a | ⚠️ Conditional | `isStructured && masterPlanJson` | Only structured projects |
| Stage 3b | ✅ Yes | `checklist` exists | Risk matrix calculation |
| Stage 3c | ⚠️ Conditional | `projectId` exists | Only in projects |
| Stage 4 | ⚠️ Conditional | `inspectorName` exists | Needs 5+ reports for patterns |
| Stage 5 | ⚠️ Conditional | Stage 4 triggered | Formats pattern warnings |

**All stages wrapped in try-catch** - failures are logged but don't break validation process.

## Architecture

### Hybrid Validation Approach
1. **AI Extraction + Context Check** → `src/app/api/validate/route.ts`
   - Extracts fields from documents (date, signatures, checklist items)
   - Checks against Project Context (Master Safety Plan)
   - Handles cross-document reasoning (Stages 3, 5)

2. **Deterministic Rule Checks** → `src/lib/validator.ts`
   - Runs after AI extraction
   - Checks missing fields, missing signatures
   - Handles structured IF-THEN logic (Stages 1, 2)

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database**: SQLite (dev) / Postgres (prod)
- **ORM**: Prisma v5
- **AI**: OpenAI GPT-4o / Anthropic Claude 3.5 Sonnet
- **PDF**: PDF.js

## Key Files

### Backend API (`src/app/api/`)
- `validate/route.ts` - Core AI validation logic, accepts projectId
- `projects/route.ts` - Create/list projects with Master Plan context
- `history/route.ts` - Fetch validation history

### Frontend (`src/app/`)
- `page.tsx` - Main controller, state management

### Components (`src/components/`)
- `Header.tsx` - Contains Project Selector
- `ProjectSelector.tsx` - Switch between projects
- `NewProjectModal.tsx` - Upload Master Safety Plan
- `HistorySidebar.tsx` - Past reports
- `layout/ResizableSplitLayout.tsx` - Resizable viewer/analysis split
- `viewer/DocumentViewer.tsx` - PDF/Image renderer
- `analysis/AnalysisPanel.tsx` - AI results display

### Utilities (`src/lib/`)
- `validator.ts` - Types + deterministic validation rules
- `db.ts` - Prisma client singleton

### Database
- `prisma/schema.prisma` - Report & Project models
- `prisma/dev.db` - Local SQLite

## Document Types We Validate
1. Toolbox Meeting (TBM) results
2. Industrial safety inspection checklist (산업안전 점검표)
3. Risk assessment report (위험성 평가 보고서)
4. Pre-work safety inspection checklist (작업 전 안전점검표)

## Output Format
- **Status**: Pass / Needs Review
- **Issues list**: Missing fields, inconsistencies, logical errors
- **Summary report**: What safety activities were recorded

## DO NOT WORK ON (Post-competition scope)
- ❌ Project Chatbot / Safety Consultant feature
- ❌ Mobile GPS Integration
- ❌ Safety Score & Gamification
- ❌ Photo-based validation (Stage 6)

These are documented in NEW_FEATURES.md as future roadmap only.

## Korean Field Names Reference
Common fields in safety documents:
- 점검일자 (Inspection date)
- 현장명 (Site name)
- 작업내용 (Work description)
- 점검자 (Inspector)
- 관리감독자 (Supervisor)
- 서명 (Signature)

## Testing Notes
- Local dev: `npm run dev` → http://localhost:3000
- Database: `npx prisma db push` to sync schema
- Test documents: `test-documents/` folder with 7 categories

---

## ✅ CRITICAL BUG FIXED - AI Extraction Working

**Status**: RESOLVED (Fixed on Feb 4, 2026)

### Issues Found & Fixed

**Issue 1: Wrong OpenAI API Usage**
- `callOpenAI()` was using deprecated `responses.create()` API
- Incorrect image format: `{ type: "input_image", image_url: ... }`
- Both OpenAI and Claude rejected invalid image data

**Fix Applied** (`src/app/api/validate/route.ts:102-143`):
- Changed to standard Chat Completions API: `chat.completions.create()`
- Correct image format: `{ type: "image_url", image_url: { url: ..., detail: "high" } }`
- AI extraction now works perfectly with text and images ✅

**Issue 2: Overly Strict Validation Rules**
- Rules flagged N/A as suspicious for confined space, excavation, fire, electrical, height work
- N/A is **valid** when those activities aren't being performed
- Created false positives on valid documents

**Fix Applied** (`src/lib/validator.ts:369-428`):
- Removed 5 overly strict "critical N/A" rules:
  - `rule_critical_na_height`
  - `rule_critical_na_fire`
  - `rule_critical_na_confined`
  - `rule_critical_na_excavation`
  - `rule_critical_na_electrical`
- N/A values now correctly accepted when activities aren't performed ✅

### Verification

Test with `test-documents/1-valid/valid-safety-checklist.pdf`:
- ✅ Status: 200 (success)
- ✅ All fields extracted correctly (date, inspector, site, checklist)
- ✅ No false warnings
- ✅ Only 1 info-level notice (risk factor identification - expected behavior)

---

**Ready for demo (Feb 8, 2026)** ✅

---

## 🐛 OPEN BUG - TBM Timeline Delete & Loading State Issues

**Status**: UNRESOLVED (As of Feb 6, 2026)
**Priority**: Medium (functionality works, but UX issues persist)

### Issue 1: TBM Delete All Button Causes Runtime Error

**Symptom**:
- Clicking "전체 삭제" (Delete All) button in TBM Timeline throws:
  `NotFoundError: Failed to execute 'removeChild' on 'Node'`
- Error occurs in React DOM reconciliation
- Single delete works; Delete All fails
- Works in no-project context but fails inside a project (needs verification)

**Root Cause Hypothesis**:
- When all TBM records are deleted, component switches from timeline view to empty state
- ConfirmDialog was inside conditional render that changes when records become empty
- DOM tree changes during dialog callback execution causes React reconciliation error

**Files Involved**:
- `src/components/TBMTimeline.tsx` - Main component with delete logic
- `src/components/ConfirmDialog.tsx` - Confirmation dialog component
- `src/app/page.tsx` - Parent with `deleteAllTBMs()` function

### Issue 2: Loading Text and "No Records" Showing Simultaneously

**Symptom**:
- When switching to TBM tab, both messages briefly appear:
  - "TBM 기록을 불러오는 중..." (Loading)
  - "TBM 기록이 없습니다" (No records)
- Should only show one at a time

**Root Cause Hypothesis**:
- Race condition between tab switch and loading state
- `loadingTBMs` might be `false` from previous state when tab activates
- useEffect that calls `loadTBMRecords()` fires AFTER initial render

### Attempted Fixes (All Unsuccessful)

#### Attempt 1: React Portal for ConfirmDialog
**Rationale**: Render dialog outside TBMTimeline's DOM tree to avoid reconciliation issues
**Changes**:
```tsx
// TBMTimeline.tsx
import { createPortal } from "react-dom";

const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);

const renderConfirmDialog = () => {
  if (!confirmDelete || !mounted) return null;
  return createPortal(<ConfirmDialog ... />, document.body);
};
```
**Result**: Did not fix the issue

#### Attempt 2: Separate onConfirm and onClose Handling
**Rationale**: ConfirmDialog calls both `onConfirm()` then `onClose()`, causing double state update
**Changes**:
```tsx
// ConfirmDialog.tsx - Added closeOnConfirm prop
interface ConfirmDialogProps {
  // ...
  closeOnConfirm?: boolean; // defaults to true
}

onClick={() => {
  onConfirm();
  if (closeOnConfirm) {
    onClose();
  }
}}

// TBMTimeline.tsx - Use closeOnConfirm={false}
<ConfirmDialog
  closeOnConfirm={false}
  onConfirm={() => {
    setConfirmDelete(null); // Handle closing here
    setTimeout(() => onDeleteAll?.(), 0);
  }}
/>
```
**Result**: Did not fix the issue

#### Attempt 3: Set Loading State Before Tab Switch
**Rationale**: Prevent flash of empty state by ensuring loading=true before render
**Changes**:
```tsx
// page.tsx - Tab button click handler
<button onClick={() => {
  setLoadingTBMs(true);  // Set loading first
  setActiveTab("tbm");
}}>

// page.tsx - TBM completion callback
setLoadingTBMs(true);
setActiveTab("tbm");
await loadTBMRecords();
```
**Result**: Did not fix the issue

#### Attempt 4: hasLoadedOnce State in TBMTimeline
**Rationale**: Only show empty state after first load completes
**Changes**:
```tsx
// TBMTimeline.tsx
const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

useEffect(() => {
  if (!loading && !hasLoadedOnce) {
    setHasLoadedOnce(true);
  }
}, [loading, hasLoadedOnce]);

// Show loading if loading OR haven't loaded once
if (loading || !hasLoadedOnce) {
  return <LoadingState />;
}
```
**Result**: Did not fix the issue

### Current State of Code

The attempted fixes are still in the code:
- `ConfirmDialog.tsx` has `closeOnConfirm` prop (lines 14-15, 27, 100-102)
- `TBMTimeline.tsx` uses portal and `hasLoadedOnce` state
- `page.tsx` has `setLoadingTBMs(true)` before tab switches

### Debugging Notes

- User observed: Delete works in no-project context, fails in project context
- Console shows: `[TBMTimeline] Received records: X loading: true/false`
- The `tbmInitialLoadDone` state exists in page.tsx (line 382) but is never used

### Possible Next Steps to Investigate

1. **Lift dialog state to parent**: Move ConfirmDialog rendering to page.tsx entirely, outside TBMTimeline
2. **Check project-specific code paths**: Compare `loadTBMRecords` behavior with/without projectId
3. **Add more console logs**: Track exact sequence of state changes during delete
4. **Check React StrictMode**: Could be causing double-render issues in development
5. **Verify cache clearing**: User mentioned "maybe it is cache" - try hard refresh
6. **Check if HMR is causing issues**: Full page reload vs hot reload behavior

### Related Code Locations

```
src/components/TBMTimeline.tsx:28-40    - State declarations
src/components/TBMTimeline.tsx:93-139   - renderConfirmDialog with portal
src/components/TBMTimeline.tsx:141-151  - Loading state condition
src/components/ConfirmDialog.tsx:14-15  - closeOnConfirm prop
src/app/page.tsx:380-382                - TBM state declarations
src/app/page.tsx:450-456                - useEffect for loading TBMs
src/app/page.tsx:1105-1129              - loadTBMRecords function
src/app/page.tsx:1150-1178              - deleteAllTBMs function
src/app/page.tsx:1865-1869              - Tab button with loading fix
```

---