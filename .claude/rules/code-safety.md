---
category: 코드 스타일 가이드
section: 코드 안전성
updated: 2025-01-30
---

# 절대 하지 말 것 & 반드시 할 것

## 절대 하지 말 것

- ❌ **API 키를 JS 파일에 하드코딩**
- ❌ **`document.write()` 사용**
- ❌ **`innerHTML`로 사용자 입력 삽입 (XSS 위험)**
- ❌ **이미지 용량 검증 없이 업로드**

```javascript
// ❌Bad - XSS 취약점
const userComment = getUserInput();
element.innerHTML = userComment;

// ✅Good - 안전한 방법
const userComment = getUserInput();
element.textContent = userComment;

// ❌Bad - API 키 노출
const API_KEY = 'sk-1234567890abcdef';
fetch(`https://api.openai.com/v1/completions?api_key=${API_KEY}`);

// ✅Good - 환경변수 사용
const response = await fetch('/api/proxy', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'Hello' }),
});
```

---

## 반드시 할 것

- ✅ **API 키는 환경변수 또는 서버 프록시 사용**
- ✅ **이미지 업로드 전 용량/형식 검증** (5MB 이하, jpg/png)
- ✅ **로딩 스피너 표시**
- ✅ **에러 시 사용자 친화적 알림**
- ✅ **폼 제출 시 버튼 비활성화** (중복 방지)

```javascript
// ✅ Good - 파일 검증
const validateImage = (file) => {
  const validTypes = ['image/jpeg', 'image/png'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!validTypes.includes(file.type)) {
    throw new Error('jpg 또는 png 파일만 가능합니다');
  }

  if (file.size > maxSize) {
    throw new Error('파일 크기는 5MB 이하여야 합니다');
  }

  return true;
};

// ✅ Good - 폼 제출 시 버튼 비활성화
const handleSubmit = async (event) => {
  event.preventDefault();
  const submitButton = event.target.querySelector('button[type="submit"]');

  submitButton.disabled = true;
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      body: new FormData(event.target),
    });

    if (!response.ok) {
      alert('요청 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
      return;
    }

    alert('성공적으로 처리되었습니다!');
  } catch (error) {
    console.error('Error:', error);
    alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
  } finally {
    submitButton.disabled = false;
  }
};
```
