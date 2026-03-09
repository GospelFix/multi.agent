# SKILL.md - 사용 가능한 커스텀 슬래시 커맨드 목록

> 새 스킬 추가 시 이 파일에도 반드시 등록하세요.
> 실제 스킬 파일은 `.claude/commands/` 디렉토리에 위치합니다.

---

## Package

```yaml
name: multi_agent_dev_skills
description: Claude Code MVP 개발에 사용하는 커스텀 슬래시 커맨드 모음입니다. 코드 스타일 가이드, 프로젝트 컨텍스트 로드 등 개발 워크플로우를 자동화합니다.
version: 1.0.0
updated: 2026-03-09
```

---

## Skills

### develop

```yaml
name: develop
label: 개발 가이드 로드
command: /develop [기능명]
description: 개발 시 코드 스타일 가이드 및 프로젝트 컨텍스트를 로드합니다. 새 기능 추가, 버그 수정, 페이지 생성 전에 실행하세요.
trigger: 새 기능 추가, 버그 수정, 페이지 생성 전에 실행
model: claude-sonnet-4-6
file: .claude/commands/develop.md
updated: 2026-03-03
```
