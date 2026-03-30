# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 프로젝트 개요

**llm-agent** — 비개발자도 LLM 멀티에이전트 파이프라인을 설계·실행할 수 있는 도구.
빌드 도구 없는 순수 정적 사이트 (Vanilla JS ES6+). 브라우저에서 직접 실행.

---

## 실행 방법

빌드 없음. 로컬 서버로 열거나 브라우저에서 직접 `index.html`을 열면 됨.

```bash
# 로컬 서버 예시 (포트 무관)
npx serve .
python3 -m http.server 3000
```

---

## 아키텍처

### 스크립트 로드 순서 (모든 페이지)

```html
<script src="js/store.js"></script>   <!-- 1. 상태 관리 (반드시 최우선 로드) -->
<script src="js/app.js"></script>     <!-- 2. 사이드바·공통 초기화 -->
<script src="js/[페이지].js"></script> <!-- 3. 페이지 전용 로직 -->
```

`store.js`는 IIFE 패턴으로 `window.Store`를 노출. 다른 모든 스크립트가 `Store.get() / Store.set()` 으로 상태를 읽고 씀.

### Store (localStorage)

- KEY: `mas_state`
- 주요 필드:

| 필드 | 설명 |
|------|------|
| `apiKeys.claude / openai / custom` | 프로바이더별 API 키 |
| `customApiEndpoint` / `customModelId` | 커스텀 OpenAI-compatible 엔드포인트 |
| `agentOverrides` | `{ [agentId]: { model, rank, tokenMultiplier } }` |
| `promptOverrides` | `{ [agentId]: string }` — 에이전트별 프롬프트 오버라이드 |
| `customPipeline` | 편집기로 구성한 커스텀 파이프라인 (`null`이면 기본 파이프라인) |
| `selectedAgency` | 현재 선택된 에이전시 JSON 파일명 (예: `'agents.json'`) |
| `userInput` / `brandInfo` | `{{user_input}}` / `{{brand_info}}` 변수로 프롬프트에 주입 |

### AI 호출 흐름

```
callAI(prompt, model)
  └─ detectProvider(model)   // 'claude-*' → claude, 'gpt-*'/'o1-*' → openai, 나머지 → custom
       └─ Store.get().apiKeys[provider]
            ├─ 키 있음 → 실제 API 호출
            └─ 키 없음 → 목업 모드 (해당 스텝만)
```

### 에이전트 데이터 구조 (`data/*.json`)

```json
{
  "agents": [{
    "id": "strategist",
    "model": "claude-haiku-4-5",
    "outputFile": "brand_strategy",        // 다음 스텝 inputContext로 연결되는 키
    "systemPrompt": "...{{user_input}}..." // {{변수명}} 으로 컨텍스트 누적
  }]
}
```

에이전시 파일: `agents.json` / `marketing-agents.json` / `design-agents.json` / `dev-agents.json`

### 경로 분기 패턴

루트(`index.html`) vs 서브페이지(`pages/*.html`) 간 상대 경로 차이를 모든 JS 파일에서 동일하게 처리:

```javascript
const IS_SUB_PAGE = window.location.pathname.includes('/pages/');
const DATA_ROOT   = IS_SUB_PAGE ? '../data/' : './data/';
const ROOT        = IS_SUB_PAGE ? '../' : './';
```

---

## 새 페이지 생성

"[페이지명] 페이지 만들어줘" 요청 시 3개 파일 **반드시 일괄 생성**:

| 파일 | 경로 |
|------|------|
| HTML | `pages/[페이지명].html` |
| CSS  | `css/[페이지명].css` |
| JS   | `js/[페이지명].js` |

- HTML에서 스크립트 로드 순서 준수 (`store.js` → `app.js` → 페이지 JS)
- `app.js`에서 사이드바 `NAV_ITEMS` 배열에 항목 추가

---

## 코딩 규칙 참조

상세 규칙은 `.claude/rules/` 폴더:

| 파일 | 내용 |
|------|------|
| `frontend.md` | 전체 작업 흐름 요약 + 절대 금지 사항 |
| `javascript.md` | JS 문법·포매팅·주석 규칙 |
| `css.md` | CSS 변수·반응형·터치 영역 규칙 |
| `html.md` | 시맨틱 태그·접근성 규칙 |
| `security.md` | XSS, API 키, 폼 중복 제출 방지 |
| `checklist.md` | 코드 생성 후 검증 체크리스트 |
