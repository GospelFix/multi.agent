---
category: 코드 스타일 가이드
section: 네이밍 컨벤션
updated: 2025-01-30
---

# 2️⃣ 네이밍 컨벤션

> 이 파일은 `.claude/CLAUDE.md`에서 참조되는 코드 가이드입니다.

## 변수 & 함수
- **camelCase** 사용
- 의미 있는 이름 (한 글자 이름 금지, 단 루프의 i, j, k 제외)

```javascript
// ✅ Good
const userName = 'John';
const getUserData = () => {};
const isVisible = true;
const handleSubmit = (event) => {};

// ❌ Bad
const user_name = 'John';      // snake_case
const getUserdata = () => {};   // 일관성 없음
const v = true;                 // 의미 불명확
const hs = (e) => {};           // 약자 사용
```

## 상수
- **UPPER_SNAKE_CASE** 사용
- 자주 변경되지 않는 값에만 사용

```javascript
// ✅ Good
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://api.example.com';
const DEFAULT_TIMEOUT = 5000;

// ❌ Bad
const max_retries = 3;          // snake_case
const API_URL = 'https://...';  // 이미 상수
```

## 클래스 & 생성자
- **PascalCase** 사용
- 첫 글자는 항상 대문자

```javascript
// ✅ Good
class UserManager {
  constructor(name) {
    this.name = name;
  }
}

const user = new UserManager('John');

// ❌ Bad
class userManager {}
class user_manager {}
```

## 파일명
- **kebab-case** 사용
- 영문 소문자로 작성

```
// ✅ Good
user-profile.js
payment-modal.css
product-list.html

// ❌ Bad
userProfile.js
user_profile.js
UserProfile.js
```

## 불린(Boolean) 변수
- **is**, **has**, **should** 접두사 사용

```javascript
// ✅ Good
const isLoading = false;
const hasError = false;
const shouldRender = true;
const isVisible = false;
const canDelete = true;

// ❌ Bad
const loading = false;
const error = false;
const render = true;
const visible = false;
```
