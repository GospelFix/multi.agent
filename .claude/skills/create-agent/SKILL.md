---
name: create-agent
description: Claude Code 에이전트(.claude/agents/*.md)를 단계적으로 설계·생성합니다
argument-hint: "[에이전트 목적 설명 - 예: git 커밋 자동화 에이전트]"
user-invocable: true
---

Claude Code 에이전트 파일(`.claude/agents/*.md`)을 3단계 프로세스로 설계하고 생성합니다.

## 입력

`$ARGUMENTS` — 만들고 싶은 에이전트의 목적 또는 기능 설명.
예시: `git 브랜치 자동 생성 에이전트`, `코드 리뷰 후 PR 생성 에이전트`

---

## 3단계 프로세스

### 1단계: 분석

`$ARGUMENTS`에서 아래 항목을 추출합니다. 불명확한 항목은 사용자에게 확인합니다.

- **name** — kebab-case 식별자
- **description** — 언제 이 에이전트를 쓰는지 + `<example>` 블록 2개 이상
- **핵심 역할** — 에이전트 파일 첫 문단 (한 문장)
- **트리거 조건** — 어떤 명령/상황에서 실행되나
- **워크플로우 단계** — 수행할 N단계 작업 목록 (최소 2단계)
- **복잡도** — 단순(haiku) / 표준(sonnet) / 고복잡(opus)
- **메모리 필요 여부** — 반복 작업이면 project, 단발성이면 생략

### 2단계: 설계

분석 결과를 바탕으로 프론트매터 필드 값을 결정합니다.

**model:**
| 값 | 사용 상황 |
|----|----------|
| `haiku` | 단순 반복, 빠른 응답 |
| `sonnet` | 일반 개발 작업 (기본값) |
| `opus` | 복잡한 분석·설계 |

**color:**
| 값 | 사용 상황 |
|----|----------|
| `orange` | 커밋·배포 관련 |
| `blue` | 코드 리뷰·분석 |
| `green` | 생성·빌드 |
| `purple` | 문서·설계 |

**memory:**
| 값 | 사용 상황 |
|----|----------|
| `project` | 프로젝트별 패턴 학습 필요 |
| `user` | 사용자 선호도 학습 필요 |
| *(생략)* | 단발성 작업 |

### 3단계: 생성 및 검증

1. 1·2단계 결과로 에이전트 파일 초안을 작성합니다.
2. 아래 체크리스트로 품질을 평가합니다.

**CRITICAL (전부 통과해야 저장):**
- [ ] 프론트매터에 `name`, `description` 존재
- [ ] `description`에 `<example>` 블록 최소 1개
- [ ] 본문 첫 문단에 핵심 역할 설명
- [ ] 워크플로우 단계 존재 (2단계 이상)

**MAJOR (미충족 시 CONDITIONAL):**
- [ ] 한국어로 작성
- [ ] 오류 처리 섹션 존재
- [ ] 결과 보고 형식 명시

3. PASS이면 `.claude/agents/[name].md`에 저장합니다.
4. CONDITIONAL/FAIL이면 미충족 항목 수정 후 재평가합니다.

---

## 출력 형식

```
✅ 에이전트 생성 완료

파일: .claude/agents/[name].md
모델: [선택한 model]
색상: [선택한 color]
메모리: [설정 여부]

품질 평가: PASS / CONDITIONAL / FAIL
미충족 항목: (있을 경우 나열)
```

---

## 참고 파일

- 기존 에이전트 예시: `.claude/agents/commit-push-agent.md`
- 기존 에이전트 예시: `.claude/agents/static-site-reviewer.md`
