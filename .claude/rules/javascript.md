---
name: JavaScript 상세 규칙
scope: Vanilla JavaScript (ES6+)
updated: 2026-03-30
---

## 포매팅

- 들여쓰기: **스페이스 2칸** (탭 금지)
- 최대 줄 길이: **100자** (초과 시 줄바꿈 또는 변수 추출)
- 함수/클래스 사이: 1줄 공백 (2줄 개행)
- 속성/메소드 사이: 공백 없음 (1줄 개행)

## 문법 규칙

### 따옴표

- **작은따옴표(`'`)** 사용 (쌍따옴표 금지, HTML 속성 제외)

```javascript
// ✅ Good
const name = 'John';
const message = 'Hello, world!';

// ❌ Bad
const name = "John";
const message = 'Hello, "world!"';  // 따옴표 혼용
```

### 세미콜론

- **필수 사용** — 모든 문장 끝에 세미콜론 추가

```javascript
// ✅ Good
const name = 'John';
const greet = () => {
  console.log('Hello');
};

// ❌ Bad
const name = 'John'        // 세미콜론 없음
const greet = () => {
  console.log('Hello')     // 세미콜론 없음
}
```

### 변수 선언

- **`const` → `let` 우선**, `var` 절대 금지 (블록 스코프 문제)

```javascript
// ✅ Good
const MAX_ITEMS = 10;
let currentIndex = 0;

// ❌ Bad
var MAX_ITEMS = 10;       // var 사용
let MAX_ITEMS = 10;       // 상수인데 let
const currentIndex = 0;   // 변경되는데 const
```

### 화살표 함수

- **화살표 함수** 우선 (`this` 바인딩 필요 시 제외)

```javascript
// ✅ Good
const square = (x) => x * x;
const add = (a, b) => a + b;
const greet = (name) => {
  console.log(`Hello, ${name}`);
};

// ❌ Bad
const square = function(x) { return x * x; };
const add = function(a, b) { return a + b; };
```

### Async/Await

- 비동기 처리는 **`async/await`** 사용 (`.then().catch()` 체인 지양)

```javascript
// ✅ Good
const fetchUser = async (id) => {
  try {
    const response = await fetch(`/api/users/${id}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch user:', error);
  }
};

// ❌ Bad
const fetchUser = (id) => {
  return fetch(`/api/users/${id}`)
    .then(res => res.json())
    .catch(err => console.error(err));
};
```

### 비교 연산자

- **`===` / `!==`** 사용 (`==` / `!=` 금지)

```javascript
// ✅ Good
if (value === 'string') {}
if (count !== 0) {}

// ❌ Bad
if (value == 'string') {}
if (count != 0) {}
```

## 코드 구조

함수 구성 순서: **변수선언 → 헬퍼함수 → 초기화함수 → 실행**

```javascript
// ✅ Good
const createApp = (initialState = {}) => {
  // 1️⃣ 변수 선언
  const state = { ...initialState };

  // 2️⃣ 헬퍼 함수
  const updateState = (newData) => { Object.assign(state, newData); };

  // 3️⃣ 초기화
  const init = () => { document.addEventListener('click', handleClick); };

  // 4️⃣ 반환
  return { init, updateState };
};

// 5️⃣ 실행
const app = createApp();
app.init();
```

## 전역 변수 & 함수형 패턴

- 전역 변수 최소화 (클로저·IIFE·모듈로 스코프 격리)
- **순수 함수** 작성 (동일 입력 → 동일 출력)
- **불변성** 유지 (원본 데이터 변경 금지, 스프레드 연산자 활용)

```javascript
// ✅ Good — 클로저로 스코프 격리
const createCounter = () => {
  let count = 0;

  return {
    increment: () => count += 1,
    decrement: () => count -= 1,
    getCount: () => count,
  };
};

// ✅ 불변성 유지
const addItem = (items, newItem) => [...items, newItem];
const updateUser = (user, newData) => ({ ...user, ...newData });

// ❌ Bad — 전역 변수 & 원본 데이터 변경
let globalCount = 0;
const addItem = (items, newItem) => {
  items.push(newItem);  // 원본 변경
  return items;
};
```

## 주석

- **한국어** 로 작성
- 복잡한 로직에만 추가 (자명한 코드에는 불필요)
- 코드 **위에** 작성 (같은 줄 인라인 금지)
- 섹션 구분: `/* ─── 섹션명 ─── */`
- 공개 함수/클래스: **JSDoc** 작성 (`@param`, `@returns`, `@throws`)
- 향후 작업: `// TODO: 내용` / `// FIXME: 수정 필요`
