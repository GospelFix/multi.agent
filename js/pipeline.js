/* ========================================
   Pipeline JS — 파이프라인 페이지 로직
   에이전트 스텝 렌더링 + 실행 시뮬레이션
   ======================================== */

'use strict';

/* ─── 상태 ─── */
let agentsData = [];
let historyData = [];
let outputsData = [];
let currentRunIndex = 0; // 현재 선택된 실행 탭 인덱스
let isRunning = false;

/* ─── 직급 value → label/icon 변환 맵 ─── */
const RANK_MAP = {
  intern:    { label: '인턴',     icon: '🔰' },
  junior:    { label: '신입사원', icon: '🌱' },
  associate: { label: '대리',     icon: '🖥' },
  manager:   { label: '과장',     icon: '⭐' },
  lead:      { label: '팀장',     icon: '👑' },
  director:  { label: '부장',     icon: '🏆' },
};

/* ─── 직급별 토큰 한도 (1 크레딧 = 1,000 토큰) ─── */
const RANK_TOKEN_LIMITS = {
  '인턴':     500,
  '신입사원': 1000,
  '대리':     2000,
  '과장':     4000,
  '팀장':     8000,
  '부장':     10000, // 무제한이지만 과금 기준은 10,000
};

/** 에이전트의 실제 직급 한국어 라벨 반환 (오버라이드 반영) */
const getAgentRankLabel = (agent, state) => {
  const override = state.agentOverrides[agent.id] || {};
  if (override.rank && RANK_MAP[override.rank]) {
    return RANK_MAP[override.rank].label;
  }
  return agent.rank;
};

/** 토큰 → 크레딧 변환 (1 크레딧 = 1,000 토큰, 올림) */
const calcCredits = (tokens) => Math.ceil(tokens / 1000);

/* ─── 경로 설정: pages/ 하위 여부에 따라 data/pages 경로 분기 ─── */
const IS_SUB_PAGE = window.location.pathname.includes('/pages/');
const DATA_ROOT   = IS_SUB_PAGE ? '../data/' : './data/';
const PAGES_ROOT  = IS_SUB_PAGE ? './' : './pages/';

/* body data-agents → Store 동기화 (없으면 Store에서 읽기) */
const AGENTS_FILE = (() => {
  const fromBody  = document.body.dataset.agents;
  const fromStore = Store.get().selectedAgency;
  const resolved  = fromBody || fromStore || 'agents.json';
  /* 에이전시 전용 파이프라인 페이지 진입 시 Store에 동기화 */
  if (fromBody) Store.set({ selectedAgency: fromBody });
  return resolved;
})();

/* ─── 초기화 ─── */
const init = async () => {
  try {
    [agentsData, historyData, outputsData] = await Promise.all([
      fetchJSON(`${DATA_ROOT}${AGENTS_FILE}`).then(d => d.agents),
      fetchJSON(`${DATA_ROOT}history.json`).then(d => d.runs),
      fetchJSON(`${DATA_ROOT}outputs.json`).then(d => d.outputs),
    ]);

    /* localStorage에 저장된 이전 생성 결과물 앞에 병합 */
    const stored = Store.get();
    if (stored.generatedRuns?.length)    historyData    = [...stored.generatedRuns,    ...historyData];
    if (stored.generatedOutputs?.length) outputsData    = [...stored.generatedOutputs, ...outputsData];

    renderAll();
  } catch (e) {
    console.error('데이터 로드 실패:', e);
  }
};

/** JSON fetch 헬퍼 */
const fetchJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch 실패: ${url}`);
  return res.json();
};

/** 전체 렌더링 */
const renderAll = () => {
  renderPipelineSteps();
  renderAgentCards();
  renderRunPanel();
};

/* ─── 파이프라인 스텝 렌더링 ─── */
const renderPipelineSteps = () => {
  const container = document.getElementById('agent-steps');
  if (!container) return;

  const state = Store.get();
  const currentRun = historyData[currentRunIndex];
  const results = currentRun ? currentRun.results : [];

  /* 각 에이전트 상태 계산 */
  const stepsHTML = agentsData.map((agent, idx) => {
    const result = results.find(r => r.agentId === agent.id);
    const status = result ? result.status : 'pending';
    const isLast = idx === agentsData.length - 1;

    return buildStepHTML(agent, status, result, isLast, state);
  }).join('');

  container.innerHTML = stepsHTML;

  /* 스텝 버튼 이벤트 바인딩 */
  container.querySelectorAll('.tag-run[data-agent]').forEach(btn => {
    btn.addEventListener('click', () => simulateRun(btn.dataset.agent));
  });

  container.querySelectorAll('.tag-edit[data-agent]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `${PAGES_ROOT}prompts.html?agent=${btn.dataset.agent}`;
    });
  });
};

/** 단일 스텝 HTML 빌드 */
const buildStepHTML = (agent, status, result, isLast, state) => {
  const accentColor = `var(${agent.accentVar})`;
  const glowColor = `var(${agent.glowVar})`;

  /* 오버라이드 값 읽기 (모델 + 직급) */
  const override = state.agentOverrides[agent.id];
  const modelName = (override && override.model) ? override.model : agent.model;

  /* 직급: 오버라이드 우선, 없으면 JSON 원본 사용 */
  const rankData = (override && override.rank && RANK_MAP[override.rank])
    ? RANK_MAP[override.rank]
    : { label: agent.rank, icon: agent.rankIcon };

  /* 상태에 따른 노드 스타일 */
  const nodeStyle = status === 'pending'
    ? `background:${glowColor}; border-color:var(--border); opacity:0.5;`
    : `background:${glowColor}; border-color:${accentColor};`;

  /* 상태 텍스트 */
  let statusHTML = '';
  if (status === 'done') {
    statusHTML = `<span class="step-status-text status-done-text">✓ 완료</span>`;
  } else if (status === 'running') {
    statusHTML = `
      <div class="running-indicator" aria-label="실행 중">
        <div class="running-dot"></div>
        <div class="running-dot"></div>
        <div class="running-dot"></div>
      </div>
    `;
  } else {
    statusHTML = `<span class="step-status-text status-pending-text">대기중</span>`;
  }

  const connectorLine = isLast ? '' : `<div class="step-line${status === 'done' ? ' active' : ''}"></div>`;

  return `
    <div class="agent-step" data-agent="${agent.id}" data-status="${status}">
      <div class="step-connector">
        <div class="step-node" style="${nodeStyle}" aria-label="${agent.name} 에이전트">${agent.icon}</div>
        ${connectorLine}
      </div>
      <div class="step-content${status === 'pending' ? ' pending' : ''}">
        <div class="step-header">
          <div class="step-role">
            <span style="color:${accentColor}">${agent.name}</span>
            <span class="rank-badge" style="background:${glowColor};color:${accentColor};border:1px solid ${glowColor.replace('0.15', '0.3')}">${rankData.icon} ${rankData.label}</span>
            <span class="step-model">${modelName}</span>
          </div>
          <div class="step-actions">
            <span class="step-tag tag-run" data-agent="${agent.id}" role="button" aria-label="${agent.name} 단독 실행">실행</span>
            <span class="step-tag tag-edit" data-agent="${agent.id}" role="button" aria-label="${agent.name} 프롬프트 편집">편집</span>
          </div>
        </div>
        <div class="step-output">
          <span class="output-arrow">→</span>
          <div class="output-file">📄 ${agent.outputFile}</div>
          ${statusHTML}
        </div>
      </div>
    </div>
  `;
};

/* ─── 에이전트 카드 그리드 렌더링 ─── */
const renderAgentCards = () => {
  const container = document.getElementById('agent-cards-grid');
  if (!container) return;

  const state = Store.get();

  const cardsHTML = agentsData.map(agent => {
    const override = state.agentOverrides[agent.id];
    const modelName = (override && override.model) ? override.model : agent.model;
    const multiplier = (override && override.tokenMultiplier != null) ? override.tokenMultiplier : agent.tokenMultiplier;
    const tokenText = multiplier !== null ? `×${multiplier} 토큰` : '미설정';

    /* 직급 오버라이드 반영 */
    const rankData = (override && override.rank && RANK_MAP[override.rank])
      ? RANK_MAP[override.rank]
      : { label: agent.rank, icon: agent.rankIcon };

    return `
      <div class="agent-card ${agent.colorClass}" role="button" tabindex="0"
           aria-label="${agent.name} 에이전트 설정" data-agent="${agent.id}">
        <div class="agent-card-header">
          <div class="agent-icon" style="background:var(${agent.glowVar})">${agent.icon}</div>
          <div>
            <div class="agent-name">
              ${agent.name}
              <span class="rank-badge" style="background:var(${agent.glowVar});color:var(${agent.accentVar})">${rankData.icon} ${rankData.label}</span>
            </div>
            <div class="agent-desc">${agent.desc}</div>
          </div>
        </div>
        <div class="agent-meta">
          <span class="agent-model-tag">${modelName}</span>
          <span class="agent-token">${tokenText}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = cardsHTML;

  /* 카드 클릭 → 에이전트 설정 페이지 이동 */
  container.querySelectorAll('.agent-card').forEach(card => {
    card.addEventListener('click', () => {
      window.location.href = `${PAGES_ROOT}agents.html?agents=${AGENTS_FILE}&agent=${card.dataset.agent}`;
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') card.click();
    });
  });
};

/* ─── 우측 실행 패널 렌더링 ─── */
const renderRunPanel = () => {
  renderRunTabs();
  renderResultList();
  renderTokenBars();
  renderOutputPreview();
};

/** 실행 탭 렌더링 */
const renderRunTabs = () => {
  const container = document.getElementById('run-tabs');
  if (!container) return;

  const tabsHTML = historyData.map((run, idx) => `
    <div class="run-tab${idx === currentRunIndex ? ' active' : ''}" data-run-index="${idx}">
      ${run.label}
    </div>
  `).join('');

  container.innerHTML = tabsHTML + `<div class="run-tab" id="new-run-tab">+ 새 실행</div>`;

  container.querySelectorAll('.run-tab[data-run-index]').forEach(tab => {
    tab.addEventListener('click', () => {
      currentRunIndex = parseInt(tab.dataset.runIndex, 10);
      renderRunPanel();
      renderPipelineSteps();
    });
  });

  document.getElementById('new-run-tab')?.addEventListener('click', startNewRun);
};

/** 결과 리스트 렌더링 */
const renderResultList = () => {
  const container = document.getElementById('run-result-list');
  if (!container) return;

  const currentRun = historyData[currentRunIndex];
  if (!currentRun) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:11px;padding:20px">실행 데이터 없음</div>';
    return;
  }

  const listHTML = currentRun.results.map(result => {
    const agent = agentsData.find(a => a.id === result.agentId);
    if (!agent) return '';

    const statusIcon = result.status === 'done'
      ? '<div class="result-status status-done">✓</div>'
      : result.status === 'running'
        ? `<div class="result-status status-running"><div class="running-indicator"><div class="running-dot" style="width:3px;height:3px"></div></div></div>`
        : '<div class="result-status status-pending">–</div>';

    const timeText = result.status === 'done'
      ? `${result.duration}s`
      : result.status === 'running'
        ? `<span style="color:var(--accent-pipe)">...</span>`
        : '—';

    return `
      <div class="result-item ${result.status}" data-output-id="${result.outputId}" data-agent-id="${result.agentId}" role="button" tabindex="0"
           aria-label="${agent.name} 결과 보기">
        ${statusIcon}
        <div class="result-info">
          <div class="result-agent">
            <span style="color:var(${agent.accentVar})">${agent.icon} ${agent.name}</span>
            <span style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">${agent.rank}</span>
          </div>
          <div class="result-file">→ 📄 ${agent.outputFile}</div>
        </div>
        <div class="result-time">${timeText}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = listHTML;

  /* 클릭 시 미리보기 전환 (agentId도 함께 전달 → resolved prompt 표시용) */
  container.querySelectorAll('.result-item[data-output-id]').forEach(item => {
    item.addEventListener('click', () => renderOutputPreview(item.dataset.outputId, item.dataset.agentId));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') renderOutputPreview(item.dataset.outputId, item.dataset.agentId);
    });
  });

  /* 상태 표시 업데이트 */
  updateRunStatus(currentRun.status);
};

/** 실행 상태 도트 업데이트 */
const updateRunStatus = (status) => {
  const statusEl = document.getElementById('run-status-label');
  const dotEl = document.getElementById('run-status-dot');
  if (!statusEl || !dotEl) return;

  if (status === 'running') {
    dotEl.style.background = 'var(--accent-pipe)';
    statusEl.style.color = 'var(--accent-pipe)';
    statusEl.textContent = '실행 중';
    dotEl.classList.add('pulse');
  } else if (status === 'completed') {
    dotEl.style.background = 'var(--accent-dev)';
    statusEl.style.color = 'var(--accent-dev)';
    statusEl.textContent = '완료';
    dotEl.classList.remove('pulse');
  } else {
    dotEl.style.background = 'var(--text-dim)';
    statusEl.style.color = 'var(--text-dim)';
    statusEl.textContent = '대기';
    dotEl.classList.remove('pulse');
  }
};

/** 토큰 바 렌더링 */
const renderTokenBars = () => {
  const container = document.getElementById('token-bar-wrap');
  if (!container) return;

  const currentRun = historyData[currentRunIndex];
  if (!currentRun) return;

  /* 전체 최대값 기준으로 % 계산 */
  const maxTokens = Math.max(...currentRun.results.map(r => r.tokens || 0), 1);

  const barsHTML = currentRun.results.map(result => {
    const agent = agentsData.find(a => a.id === result.agentId);
    if (!agent) return '';

    const pct = result.tokens ? Math.round((result.tokens / maxTokens) * 100) : 0;
    const valText = result.tokens ? result.tokens.toLocaleString() : '—';

    return `
      <div class="token-row">
        <div class="token-label" style="color:var(${agent.accentVar})">${agent.name}</div>
        <div class="token-bar">
          <div class="token-fill" data-width="${pct}" style="width:0%;background:var(${agent.accentVar})"></div>
        </div>
        <div class="token-val">${valText}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = barsHTML;

  /* 애니메이션: 0 → 실제 너비 */
  requestAnimationFrame(() => {
    container.querySelectorAll('.token-fill').forEach(fill => {
      const w = fill.dataset.width;
      setTimeout(() => {
        fill.style.transition = 'width 0.8s ease';
        fill.style.width = `${w}%`;
      }, 300);
    });
  });
};

/** 아웃풋 미리보기 렌더링 */
const renderOutputPreview = (outputId, agentId) => {
  const previewTitle = document.getElementById('preview-title');
  const previewText = document.getElementById('preview-text');
  const previewLink = document.getElementById('preview-link');
  if (!previewTitle || !previewText) return;

  const currentRun = historyData[currentRunIndex];

  /* "null" 문자열 처리 — 새 시뮬레이션 런은 outputId가 null */
  const validId = outputId && outputId !== 'null' ? outputId : null;
  const targetId = validId || (currentRun && currentRun.results[0]?.outputId);

  /* outputId로 못 찾으면 agentId로 fallback (새 시뮬레이션 런 대응) */
  let output = outputsData.find(o => o.id === targetId);
  if (!output && agentId) {
    output = outputsData.find(o => o.agentId === agentId);
  }
  if (!output) return;

  previewTitle.textContent = `📄 ${output.label}`;
  previewText.textContent = output.content;

  /* 사용된 resolved prompt 표시 (현재 런에 저장된 경우) */
  const existingDetails = previewText.parentElement.querySelector('.prompt-details');
  if (existingDetails) existingDetails.remove();

  if (agentId && currentRun) {
    const result = currentRun.results.find(r => r.agentId === agentId);
    if (result && result.resolvedPrompt) {
      const details = document.createElement('details');
      details.className = 'prompt-details';
      details.innerHTML = `
        <summary>📋 사용된 프롬프트 보기</summary>
        <pre>${result.resolvedPrompt}</pre>
      `;
      previewText.parentElement.appendChild(details);
    }
  }

  if (previewLink) {
    previewLink.href = `${PAGES_ROOT}output.html?run=${output.runId}&output=${output.id}`;
  }
};

/* ─── 실제 Claude API 호출 ─── */
const callClaudeAPI = async (prompt, model, apiKey) => {
  const claudeModel = model && model.startsWith('claude') ? model : 'claude-haiku-4-5-20251001';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API ${res.status}`);
  }
  const data = await res.json();
  return {
    text:   data.content[0].text,
    tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
  };
};

/* ─── 입력값 기반 템플릿 아웃풋 (API 키 없을 때) ─── */
const buildTemplateOutput = (agent, userInput, brandInfo, collectedOutputs) => {
  const brand  = brandInfo.brandName      || '클라이언트';
  const tone   = brandInfo.toneAndManner  || '미입력';
  const target = brandInfo.targetAudience || '미입력';
  const colors = brandInfo.brandColors    || '미입력';
  const slogan = brandInfo.slogan         || '미입력';
  const rivals = brandInfo.competitors    || '미입력';
  const notice = '\n\n> ⚡ **AI 연결 설정**에 API 키를 입력하면 실제 AI가 이 내용을 채워드립니다.';

  switch (agent.id) {
    /* ── 기존 마케팅 파이프라인 (index.html) ── */
    case 'strategist':
      return `# 브랜드 전략서\n## ${brand}\n\n### 프로젝트 요청\n${userInput || '(없음)'}\n\n### 브랜드 가이드라인\n- 슬로건: ${slogan}\n- 컬러: ${colors}\n- 톤앤매너: ${tone}\n- 타겟: ${target}\n- 경쟁사: ${rivals}\n\n### 포지셔닝 전략\n- USP: [AI가 채웁니다]\n- 핵심 메시지: [AI가 채웁니다]\n- 타겟 인사이트: [AI가 채웁니다]${notice}`;
    case 'copywriter':
      return `# 카피 덱\n## ${brand}\n\n### 프로젝트 요청\n${userInput || '(없음)'}\n\n### 슬로건: ${slogan}\n\n### 헤드라인 3종\n- A. [AI가 채웁니다]\n- B. [AI가 채웁니다]\n- C. [AI가 채웁니다]\n\n### 서브카피\n- [AI가 채웁니다]\n\n### CTA\n- [AI가 채웁니다]${notice}`;
    case 'art_director':
      return `# 비주얼 브리프\n## ${brand}\n\n### 컬러 가이드\n${colors}\n\n### 톤앤매너\n${tone}\n\n### 비주얼 방향성\n- 이미지 무드: [AI가 채웁니다]\n- 타이포그래피: [AI가 채웁니다]\n- 레이아웃: [AI가 채웁니다]${notice}`;
    case 'content_planner':
      return `# 콘텐츠 기획서\n## ${brand}\n\n### 타겟\n${target}\n\n### 4주 콘텐츠 캘린더\n- 1주차: [AI가 채웁니다]\n- 2주차: [AI가 채웁니다]\n- 3주차: [AI가 채웁니다]\n- 4주차: [AI가 채웁니다]\n\n### 채널 전략\n- [AI가 채웁니다]${notice}`;

    /* ── 마케팅회사 파이프라인 ── */
    case 'marketing_strategist':
      return `# 마케팅 전략서\n## ${brand}\n\n### 프로젝트 요청\n${userInput || '(없음)'}\n\n### 시장 분석\n- 타겟: ${target}\n- 경쟁사: ${rivals}\n- 포지셔닝: [AI가 채웁니다]\n\n### 캠페인 목표 (KPI)\n- [AI가 채웁니다]\n\n### 채널 전략 개요\n- [AI가 채웁니다]${notice}`;
    case 'marketing_copywriter':
      return `# 카피 덱\n## ${brand}\n\n### 슬로건\n${slogan}\n\n### 헤드라인 3종\n- A. [AI가 채웁니다]\n- B. [AI가 채웁니다]\n- C. [AI가 채웁니다]\n\n### 채널별 광고 문구\n- SNS: [AI가 채웁니다]\n- 검색광고: [AI가 채웁니다]${notice}`;
    case 'marketing_media_planner':
      return `# 미디어 믹스 기획서\n## ${brand}\n\n### 채널별 예산 배분\n- SNS 광고: [AI가 채웁니다]\n- 검색광고: [AI가 채웁니다]\n- 디스플레이: [AI가 채웁니다]\n\n### 집행 기간 및 타임라인\n- [AI가 채웁니다]\n\n### 예상 도달률\n- [AI가 채웁니다]${notice}`;
    case 'marketing_analyst':
      return `# 성과 측정 프레임워크\n## ${brand}\n\n### KPI 목표값\n- 노출수: [AI가 채웁니다]\n- 클릭률: [AI가 채웁니다]\n- 전환율: [AI가 채웁니다]\n\n### 채널별 성과 지표\n- [AI가 채웁니다]\n\n### 월간 리포팅 템플릿\n- [AI가 채웁니다]${notice}`;

    /* ── 디자인 에이전시 파이프라인 ── */
    case 'creative_director':
      return `# 크리에이티브 브리프\n## ${brand}\n\n### 프로젝트 요청\n${userInput || '(없음)'}\n\n### 디자인 철학\n- [AI가 채웁니다]\n\n### 비주얼 레퍼런스 방향\n- 무드보드 키워드: ${tone}\n- 차별화 포인트: [AI가 채웁니다]${notice}`;
    case 'brand_designer':
      return `# 브랜드 아이덴티티 가이드\n## ${brand}\n\n### 컬러 팔레트\n${colors}\n\n### 타이포그래피 시스템\n- 주폰트: [AI가 채웁니다]\n- 보조폰트: [AI가 채웁니다]\n\n### 로고 활용 규칙\n- [AI가 채웁니다]${notice}`;
    case 'ux_designer':
      return `# UX 설계 문서\n## ${brand}\n\n### 사용자 페르소나\n- 타겟: ${target}\n- [AI가 채웁니다]\n\n### 유저 플로우\n- [AI가 채웁니다]\n\n### 주요 화면 IA\n- [AI가 채웁니다]${notice}`;
    case 'ui_designer':
      return `# UI 디자인 시스템 스펙\n## ${brand}\n\n### 컴포넌트 목록\n- 버튼: [AI가 채웁니다]\n- 카드: [AI가 채웁니다]\n- 폼: [AI가 채웁니다]\n\n### 인터랙션 규칙\n- [AI가 채웁니다]\n\n### 스페이싱 시스템\n- [AI가 채웁니다]${notice}`;
    case 'motion_designer':
      return `# 모션 가이드라인\n## ${brand}\n\n### 애니메이션 원칙\n- 이징: [AI가 채웁니다]\n- 타이밍: [AI가 채웁니다]\n\n### 화면 전환 패턴\n- [AI가 채웁니다]\n\n### 마이크로인터랙션\n- [AI가 채웁니다]${notice}`;

    /* ── SI 에이전시 파이프라인 ── */
    case 'si_pm':
      return `# 요구사항 정의서\n## ${brand}\n\n### 프로젝트 요청\n${userInput || '(없음)'}\n\n### 기능 요구사항\n- [AI가 채웁니다]\n\n### 비기능 요구사항\n- [AI가 채웁니다]\n\n### 마일스톤 일정\n- 1단계: [AI가 채웁니다]\n- 2단계: [AI가 채웁니다]\n\n### 산출물 목록\n- [AI가 채웁니다]${notice}`;
    case 'si_ui_designer':
      return `# 화면 설계서\n## ${brand}\n\n### 주요 화면 목록\n- [AI가 채웁니다]\n\n### 내비게이션 플로우\n- [AI가 채웁니다]\n\n### UI 가이드\n- 컬러: ${colors || '[AI가 채웁니다]'}\n- 타이포그래피: [AI가 채웁니다]${notice}`;
    case 'si_backend_dev':
      return `# API 설계 문서\n## ${brand}\n\n### RESTful 엔드포인트 목록\n- POST /auth/login\n- GET /items\n- [AI가 채웁니다]\n\n### DB 스키마\n- [AI가 채웁니다]\n\n### 인증/인가 방식\n- [AI가 채웁니다]${notice}`;
    case 'si_frontend_dev':
      return `# 프론트엔드 구현 스펙\n## ${brand}\n\n### 페이지 구조\n- [AI가 채웁니다]\n\n### 컴포넌트 계층도\n- [AI가 채웁니다]\n\n### 상태 관리 전략\n- [AI가 채웁니다]\n\n### API 연동 방식\n- [AI가 채웁니다]${notice}`;
    case 'si_qa_engineer':
      return `# QA 검수 문서\n## ${brand}\n\n### 기능 테스트 시나리오\n- [AI가 채웁니다]\n\n### 엣지 케이스\n- [AI가 채웁니다]\n\n### 납품 전 검수 체크리스트\n- [ ] [AI가 채웁니다]\n\n### 성능 기준값\n- [AI가 채웁니다]${notice}`;

    default:
      return `# ${agent.name} 결과물\n## ${brand}\n\n### 요청\n${userInput || '(없음)'}${notice}`;
  }
};

/* ─── 파이프라인 실행 ─── */
const simulateRun = async (startAgentId) => {
  if (isRunning) return;
  isRunning = true;

  const runBtn     = document.getElementById('run-btn-header');
  const runBtnCard = document.getElementById('run-btn-card');
  if (runBtn)     { runBtn.disabled = true;     runBtn.textContent = '⏳ 실행 중...'; }
  if (runBtnCard) { runBtnCard.disabled = true; runBtnCard.innerHTML = '<span>⏳</span> 실행 중...'; }

  const startIdx = startAgentId ? agentsData.findIndex(a => a.id === startAgentId) : 0;

  const newRun = {
    id: `run-${Date.now()}`,
    label: `${historyData.length + 1}차 실행`,
    status: 'running',
    createdAt: new Date().toISOString(),
    completedAt: null,
    totalTokens: 0,
    completedSteps: startIdx,
    totalSteps: agentsData.length,
    results: agentsData.map((agent, idx) => ({
      agentId: agent.id,
      status: idx < startIdx ? 'done' : 'pending',
      duration: null,
      tokens: null,
      outputId: null,
    })),
  };

  historyData.unshift(newRun);
  currentRunIndex = 0;
  renderRunPanel();
  renderPipelineSteps();

  /* 크레딧 사전 체크 (API 키 없을 때만) */
  const preState = Store.get();
  const apiKey   = preState.apiKey || '';

  if (!apiKey) {
    const requiredCredits = agentsData.slice(startIdx).reduce((sum, agent) => {
      return sum + calcCredits(RANK_TOKEN_LIMITS[getAgentRankLabel(agent, preState)] || 2000);
    }, 0);
    if (preState.tokenBalance < requiredCredits) {
      alert(`크레딧이 부족합니다.\n필요: ${requiredCredits} 크레딧 / 잔여: ${preState.tokenBalance} 크레딧`);
      isRunning = false;
      if (runBtn)     { runBtn.disabled = false;     runBtn.textContent = '▶ 전체 실행'; }
      if (runBtnCard) { runBtnCard.disabled = false; runBtnCard.innerHTML = '<span>▶</span> 실행 중'; }
      return;
    }
  }

  const userInput = Store.get().userInput || '';
  const brandInfo = Store.get().brandInfo || {};
  const collectedOutputs = {};
  const newRunOutputs    = [];

  /* startIdx > 0이면 이전 스텝 아웃풋 사전 수집 */
  agentsData.slice(0, startIdx).forEach(agent => {
    const existing = outputsData.find(o => o.agentId === agent.id);
    if (existing) collectedOutputs[agent.outputFile] = existing.content;
  });

  for (let i = startIdx; i < agentsData.length; i++) {
    const agent = agentsData[i];

    const state       = Store.get();
    const override    = state.agentOverrides[agent.id] || {};
    const rawPrompt   = state.promptOverrides[agent.id] ?? override.systemPrompt ?? agent.systemPrompt ?? '';
    const resolvedPrompt = resolvePrompt(rawPrompt, userInput, brandInfo, collectedOutputs);

    newRun.results[i].status         = 'running';
    newRun.results[i].resolvedPrompt = resolvedPrompt;
    Store.set({ activeRunStep: agent.id, pipelineStatus: 'running' });
    renderRunPanel();
    renderPipelineSteps();

    let generatedContent = '';
    let tokens = 0;
    const t0 = Date.now();

    if (apiKey) {
      /* ── 실제 AI 생성 ── */
      try {
        const result    = await callClaudeAPI(resolvedPrompt, agent.model, apiKey);
        generatedContent = result.text;
        tokens           = result.tokens;
      } catch (err) {
        console.error(`${agent.name} API 오류:`, err);
        generatedContent = `❌ 생성 실패 (${agent.name})\n\n오류: ${err.message}`;
        tokens = 0;
      }
    } else {
      /* ── 목업 시뮬레이션 ── */
      const mockDuration = 2 + Math.random() * 2;
      await delay(mockDuration * 1000);
      const rankLabel  = getAgentRankLabel(agent, Store.get());
      const tokenLimit = RANK_TOKEN_LIMITS[rankLabel] || 2000;
      tokens           = Math.floor(tokenLimit * (0.6 + Math.random() * 0.4));

      const hasInput = userInput.trim() || brandInfo.brandName?.trim();
      if (hasInput) {
        generatedContent = buildTemplateOutput(agent, userInput, brandInfo, collectedOutputs);
      } else {
        const simOutput  = outputsData.find(o => o.agentId === agent.id);
        generatedContent = simOutput?.content || `(${agent.name} 예시 없음)`;
      }
    }

    const duration    = parseFloat(((Date.now() - t0) / 1000).toFixed(1));
    const usedCredits = calcCredits(tokens || 100);

    /* 아웃풋 레코드 생성 및 runtime 배열 추가 */
    const outputRecord = {
      id:        `out-${newRun.id}-${agent.id}`,
      runId:     newRun.id,
      agentId:   agent.id,
      fileName:  agent.outputFile,
      label:     agent.desc,
      createdAt: new Date().toISOString(),
      content:   generatedContent,
    };
    outputsData.push(outputRecord);
    newRunOutputs.push(outputRecord);
    collectedOutputs[agent.outputFile] = generatedContent;

    newRun.results[i].status   = 'done';
    newRun.results[i].duration = duration;
    newRun.results[i].tokens   = tokens;
    newRun.results[i].credits  = usedCredits;
    newRun.results[i].outputId = outputRecord.id;
    newRun.completedSteps      = i + 1;
    newRun.totalTokens        += tokens;

    const afterState = Store.get();
    Store.set({ tokenBalance: Math.max(0, afterState.tokenBalance - usedCredits) });
    updateTokenDisplay();

    renderRunPanel();
    renderPipelineSteps();
  }

  newRun.status      = 'completed';
  newRun.completedAt = new Date().toISOString();
  Store.set({ activeRunStep: null, pipelineStatus: 'completed' });

  /* 생성 결과물 localStorage 영속 저장 */
  const st = Store.get();
  Store.set({
    generatedRuns:    [newRun,          ...(st.generatedRuns    || [])],
    generatedOutputs: [...newRunOutputs, ...(st.generatedOutputs || [])],
  });

  renderRunPanel();
  renderPipelineSteps();

  isRunning = false;
  if (runBtn)     { runBtn.disabled = false;     runBtn.textContent = '▶ 전체 실행'; }
  if (runBtnCard) { runBtnCard.disabled = false; runBtnCard.innerHTML = '<span>▶</span> 실행 중'; }
};

/** 새 실행 시작 */
const startNewRun = () => {
  if (!isRunning) simulateRun();
};

/** brandInfo 객체를 프롬프트 주입용 텍스트로 변환 */
const formatBrandInfo = (brandInfo) => {
  if (!brandInfo) return '(브랜드 정보 미입력)';
  const fields = [
    brandInfo.brandName    ? `브랜드명: ${brandInfo.brandName}` : null,
    brandInfo.slogan       ? `슬로건: ${brandInfo.slogan}` : null,
    brandInfo.brandColors  ? `브랜드 컬러: ${brandInfo.brandColors}` : null,
    brandInfo.toneAndManner? `톤앤매너: ${brandInfo.toneAndManner}` : null,
    brandInfo.targetAudience? `타겟 고객: ${brandInfo.targetAudience}` : null,
    brandInfo.competitors  ? `경쟁사: ${brandInfo.competitors}` : null,
  ].filter(Boolean);
  return fields.length > 0 ? fields.join('\n') : '(브랜드 정보 미입력)';
};

/** {{변수}}를 실제 값으로 치환 — collectedOutputs의 모든 키를 동적으로 처리 */
const resolvePrompt = (prompt, userInput, brandInfo, collectedOutputs) => {
  /* 기본 변수 치환 */
  let resolved = prompt
    .replace(/\{\{user_input\}\}/g, userInput || '(요청 없음)')
    .replace(/\{\{brand_info\}\}/g, formatBrandInfo(brandInfo));

  /* 수집된 아웃풋 변수 동적 치환 (에이전시 유형 불문 모두 처리) */
  Object.entries(collectedOutputs).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    resolved = resolved.replace(regex, value || `(${key} 미생성)`);
  });

  return resolved;
};

/** Promise 기반 딜레이 헬퍼 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ─── DOM 준비 후 초기화 ─── */
document.addEventListener('DOMContentLoaded', () => {
  init();

  /* 전체 실행 버튼 이벤트 */
  document.getElementById('run-btn-header')?.addEventListener('click', () => simulateRun());
  document.getElementById('run-btn-card')?.addEventListener('click', () => simulateRun());

  /* 프로젝트 요청 입력 → Store 저장 ({{user_input}} 변수 소스) */
  const userInputArea = document.getElementById('user-input-area');
  if (userInputArea) {
    userInputArea.value = Store.get().userInput || '';
    userInputArea.addEventListener('input', () => {
      Store.set({ userInput: userInputArea.value });
    });
  }

  /* 브랜드 가이드라인 입력 → Store 저장 ({{brand_info}} 변수 소스) */
  const brandFields = [
    { id: 'brand-name',        key: 'brandName' },
    { id: 'brand-slogan',      key: 'slogan' },
    { id: 'brand-colors',      key: 'brandColors' },
    { id: 'brand-tone',        key: 'toneAndManner' },
    { id: 'brand-target',      key: 'targetAudience' },
    { id: 'brand-competitors', key: 'competitors' },
  ];

  const savedBrand = Store.get().brandInfo || {};
  brandFields.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = savedBrand[key] || '';
    el.addEventListener('input', () => {
      const current = Store.get().brandInfo || {};
      Store.set({ brandInfo: { ...current, [key]: el.value } });
    });
  });

  /* 브랜드 가이드라인 카드 펼치기/접기 토글 */
  const toggleBtn = document.getElementById('brand-info-toggle');
  const brandBody = document.getElementById('brand-info-body');
  if (toggleBtn && brandBody) {
    toggleBtn.addEventListener('click', () => {
      const isOpen = brandBody.style.display !== 'none';
      brandBody.style.display = isOpen ? 'none' : 'block';
      toggleBtn.textContent = isOpen ? '펼치기 ▾' : '접기 ▴';
      toggleBtn.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  /* API 키 UI 초기화 */
  updateApiKeyUI();

  /* API 키 저장 버튼 */
  document.getElementById('api-key-save-btn')?.addEventListener('click', () => {
    const input = document.getElementById('api-key-input');
    if (!input) return;
    const key = input.value.trim();
    Store.set({ apiKey: key });
    updateApiKeyUI();
    input.value = '';
  });

  /* API 키 삭제 버튼 */
  document.getElementById('api-key-clear-btn')?.addEventListener('click', () => {
    Store.set({ apiKey: '' });
    updateApiKeyUI();
  });
});

/** API 키 상태 UI 업데이트 */
const updateApiKeyUI = () => {
  const statusEl   = document.getElementById('api-key-status');
  const clearBtn   = document.getElementById('api-key-clear-btn');
  const inputEl    = document.getElementById('api-key-input');
  const hasKey     = !!(Store.get().apiKey);

  if (statusEl) {
    statusEl.className = `api-key-status ${hasKey ? 'connected' : 'disconnected'}`;
    statusEl.textContent = hasKey ? '● AI 연결됨' : '○ 미연결 (목업 모드)';
  }
  if (clearBtn) clearBtn.style.display = hasKey ? 'inline-flex' : 'none';
  if (inputEl)  inputEl.placeholder    = hasKey ? '새 키로 교체하려면 입력...' : 'sk-ant-api03-...';
};
