---
category: 코드 스타일 가이드
section: 목데이터 규칙
updated: 2025-01-30
---

# 목데이터 규칙

## JSON 파일 관리
- 모든 데이터는 `data/*.json` 파일로 분리하여 관리
- API 연동 전 목데이터로 UI 개발 및 테스트

```javascript
// ✅ Good - 목데이터 파일 사용
const fetchUsers = async () => {
  const response = await fetch('/data/users.json');
  const users = await response.json();
  return users;
};

// ❌ Bad - 코드 내 하드코딩
const users = [
  { id: 1, name: 'John', email: 'john@example.com' },
  { id: 2, name: 'Jane', email: 'jane@example.com' },
];
```
