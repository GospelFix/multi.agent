---
category: 코드 스타일 가이드
section: 들여쓰기 & 포매팅
updated: 2025-01-30
---

# 들여쓰기 & 포매팅

## 들여쓰기
- **스페이스 2칸** (탭 사용 금지)
- 모든 언어(HTML, CSS, JS)에 동일하게 적용

```javascript
// ✅ Good
const myFunction = () => {
  const name = 'John';
  if (name) {
    console.log(name);
  }
};

// ❌ Bad
const myFunction = () => {
    const name = 'John';  // 4칸
	if (name) {           // 탭 사용
		console.log(name);
	}
};
```

## 줄 길이
- 최대 **100자** 이내
- 100자를 초과하면 줄바꿈 또는 변수 추출

```javascript
// ✅ Good
const longVariableName = 'This is a long string that describes something important';
const result = performComplexCalculation(param1, param2, param3);

// ❌ Bad
const longVariableName = 'This is a very long string that describes something very important in detail';
const result = performComplexCalculation(param1, param2, param3, param4, param5);
```

## 개행
- 함수/클래스 사이: **한 줄 공백** (2줄 개행)
- 로직 블록 사이: **한 줄 공백** (2줄 개행)
- 속성/메소드 사이: **공백 없음** (1줄 개행)

```javascript
// ✅ Good
const createApp = () => {
  const state = {};

  const handleClick = () => {
    // ...
  };

  const init = () => {
    // ...
  };

  return { init };
};


const app = createApp();
```
