---
name: HTML 규칙
scope: HTML5
updated: 2026-03-30
---

## 시맨틱 태그

- `<header>`, `<main>`, `<section>`, `<footer>`, `<nav>`, `<aside>` 사용
- `<div>` 남용 금지 — 의미에 맞는 태그 선택

```html
<!-- ✅ Good -->
<header><nav>...</nav></header>
<main><section>콘텐츠</section></main>
<footer>...</footer>

<!-- ❌ Bad -->
<div class="header"><div class="nav">...</div></div>
```

## 접근성

- 이미지: `alt` 속성 필수
- 아이콘 버튼 등 의미 전달 필요 시: `aria-label` 필수
- 인터랙티브 요소: `role` 속성 적절히 사용

```html
<!-- ✅ Good -->
<img src="logo.png" alt="회사 로고">
<button aria-label="메뉴 열기">☰</button>

<!-- ❌ Bad -->
<img src="logo.png">
<button>☰</button>
```

## 모바일

- viewport 메타 태그 필수

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```
