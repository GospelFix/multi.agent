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

/* ─── Provider 탭 전역 상태 ─── */
const PROVIDER_META = {
  claude: {
    placeholder: 'sk-ant-api03-...',
    subtitle: 'Anthropic Claude API 키를 입력하면 실제 AI가 결과물을 생성합니다',
    link: 'https://console.anthropic.com/settings/keys',
    linkLabel: 'Anthropic Console에서 API 키 발급하기 →',
  },
  openai: {
    placeholder: 'sk-...',
    subtitle: 'OpenAI API 키를 입력하면 실제 AI가 결과물을 생성합니다',
    link: 'https://platform.openai.com/api-keys',
    linkLabel: 'OpenAI Platform에서 API 키 발급하기 →',
  },
  custom: {
    placeholder: 'sk-... 또는 커스텀 키',
    subtitle: 'OpenAI-compatible API (Groq, Together AI, Ollama 등)',
  },
};

let selectedProvider = localStorage.getItem('selectedProvider') || 'claude';

/** 탭 선택 상태 적용 (placeholder·링크·subtitle 교체, 커스텀 필드 표시) */
function applyProviderTab(provider) {
  selectedProvider = provider;
  localStorage.setItem('selectedProvider', provider);

  /* 탭 active 클래스 전환 */
  document.querySelectorAll('.provider-tab').forEach(btn => {
    const isActive = btn.dataset.provider === provider;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  /* 커스텀 전용 엔드포인트·모델 입력 필드 표시/숨김 */
  const customFields = document.getElementById('custom-api-fields');
  if (customFields) customFields.style.display = provider === 'custom' ? 'block' : 'none';

  /* 현재 프로바이더 키 미입력 상태에서 placeholder·발급링크·subtitle 교체 */
  const state    = Store.get();
  const apiKeys  = state.apiKeys || {};
  const hasKey   = !!(apiKeys[provider] || '');
  if (!hasKey) {
    const meta = PROVIDER_META[provider] || PROVIDER_META.claude;
    const inputEl    = document.getElementById('api-key-input');
    const subtitleEl = document.getElementById('api-key-subtitle');
    const linkEl     = document.getElementById('api-key-link');
    const linkRow    = document.getElementById('api-key-link-row');

    if (inputEl)    inputEl.placeholder    = meta.placeholder;
    if (subtitleEl) subtitleEl.textContent  = meta.subtitle;
    if (linkEl && meta.link) {
      linkEl.href        = meta.link;
      linkEl.textContent = meta.linkLabel || '';
      linkEl.className   = `api-key-link provider-${provider}`;
    }
    /* 커스텀 탭은 발급 링크 숨김 */
    if (linkRow) linkRow.style.display = meta.link ? 'block' : 'none';
  }

  /* 커스텀 탭 저장값 복원 */
  if (provider === 'custom') {
    const endpointInput = document.getElementById('custom-endpoint-input');
    const modelInput    = document.getElementById('custom-model-input');
    if (endpointInput) endpointInput.value = state.customApiEndpoint || '';
    if (modelInput)    modelInput.value    = state.customModelId     || '';
  }
}

/* ─── 테스트용 샘플 데이터 ─── */
const SAMPLE_DATA = {
  userInput: '개인 자산관리 핀테크 앱 "Vaulto" 신규 브랜드 아이덴티티 및 UI 시스템 구축. 25~38세 사회초년생·밀레니얼 직장인 타겟. 앱 스토어 론칭 6주 전, 앱 UI·온보딩 화면·마케팅 소재(앱스토어 배너, 인스타그램 피드)까지 디자인 납품 필요. 기존 딱딱한 금융앱 이미지를 탈피하고 "내 돈을 쉽게 다루는 경험"을 비주얼로 구현 목표.',
  brandInfo: {
    brandName: 'Vaulto(볼토)',
    slogan: '내 돈이 일하는 방식',
    brandColors: '딥 인디고(#3D3BE8), 민트 그린(#00D4AA), 오프화이트(#F7F7FA)',
    toneAndManner: '신뢰감 있는, 간결한, 현대적, 친근하되 프로페셔널한',
    targetAudience: '25~38세 사회초년생·밀레니얼 직장인, 첫 투자·저축 시작하는 MZ세대',
    competitors: 'Toss, 카카오페이, Robinhood(해외), 뱅크샐러드',
  },
};

/* ─── 스텝 팔레트 — 인덱스 기반 색상 배열 ─── */
const STEP_PALETTE = ['#f59e0b', '#22c55e', '#8b5cf6', '#ef4444', '#3b82f6', '#f97316'];

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

/* ─── 커스텀 에이전트 뱃지 렌더링 ─── */
const renderCustomPipelineBadge = (name) => {
  const headerDiv = document.querySelector('.page-header > div:first-child');
  if (!headerDiv) return;

  /* 기존 뱃지 제거 후 재삽입 */
  document.getElementById('custom-pipeline-badge')?.remove();

  const badge = document.createElement('p');
  badge.id = 'custom-pipeline-badge';
  badge.className = 'custom-pipeline-badge';
  badge.innerHTML = `✏️ 커스텀 에이전트 활성 <strong>${name || '이름 없음'}</strong>
    — <a href="./pages/pipeline-editor.html" style="color:inherit;text-decoration:underline">편집기에서 변경</a>`;
  headerDiv.appendChild(badge);
};

/* ─── 초기화 ─── */
const init = async () => {
  try {
    const stored = Store.get();
    const customPipeline = stored.customPipeline;

    /* agents, history, outputs 병렬 로드 */
    let [rawAgents, historyRaw, outputsRaw] = await Promise.all([
      fetchJSON(`${DATA_ROOT}${AGENTS_FILE}`).then(d => d.agents),
      fetchJSON(`${DATA_ROOT}history.json`).then(d => d.runs),
      fetchJSON(`${DATA_ROOT}outputs.json`).then(d => d.outputs),
    ]);

    /* 커스텀 에이전트이 있으면 스텝 순서대로 agentsData 재구성 */
    if (customPipeline?.steps?.length) {
      /* agentData가 임베드된 크로스 에이전시 스텝 우선 지원 */
      const agentsMap = Object.fromEntries(rawAgents.map(a => [a.id, a]));
      agentsData = customPipeline.steps
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(step => {
          /* step.agentData가 있으면 크로스 에이전시 임베드 데이터 사용, 없으면 파일에서 룩업 */
          const base = step.agentData || agentsMap[step.agentId];
          if (!base) return null;
          return {
            ...base,
            outputFile: step.outputFile || base.outputFile,
            ...(step.model && { model: step.model }),
            ...(step.rank  && { rank: step.rank }),
          };
        })
        .filter(Boolean);

      renderCustomPipelineBadge(customPipeline.name);
    } else {
      agentsData = rawAgents;
    }

    historyData = historyRaw;
    outputsData = outputsRaw;

    /* localStorage에 저장된 이전 생성 결과물 앞에 병합 */
    if (stored.generatedRuns?.length)    historyData = [...stored.generatedRuns,    ...historyData];
    if (stored.generatedOutputs?.length) outputsData = [...stored.generatedOutputs, ...outputsData];

    /* agents.html에서 에이전시 선택 후 적용 버튼 클릭 시 pendingRun 감지 */
    const pendingState = Store.get();
    if (pendingState.pendingNewRun && pendingState.pendingRunAgents?.length > 0) {
      agentsData = pendingState.pendingRunAgents;           // 선택된 에이전시 에이전트로 교체
      createPendingRunTab(pendingState.pendingRunLabel);
      Store.set({ pendingNewRun: false, pendingRunAgents: null, pendingRunLabel: null });
    } else if (historyData[currentRunIndex]?.agentsSnapshot?.length > 0) {
      /* 재방문 시: 현재 탭의 agentsSnapshot으로 agentsData 복원 */
      agentsData = historyData[currentRunIndex].agentsSnapshot;
    }

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

/** 에이전시 선택 후 대기 상태의 run 탭 생성 */
const createPendingRunTab = (label) => {
  const runLabel = label
    ? `${label} (${historyData.length + 1}차)`
    : `${historyData.length + 1}차 실행`;

  /* 현재 Store 오버라이드를 스냅샷에 반영 — 각 실행의 직급이 영구 보존됨 */
  const currentState = Store.get();
  const snapshotAgents = agentsData.map(agent => {
    const override = currentState.agentOverrides?.[agent.id] || {};
    if (!override.rank) return agent;
    const rankData = RANK_MAP[override.rank];
    if (!rankData) return agent;
    return { ...agent, rank: rankData.label, rankIcon: rankData.icon };
  });

  const newRun = {
    id:             `run-${Date.now()}`,
    label:          runLabel,
    status:         'pending',
    agentsSnapshot: JSON.parse(JSON.stringify(snapshotAgents)), // 오버라이드 반영된 스냅샷
    createdAt:      new Date().toISOString(),
    completedAt:    null,
    totalTokens:    0,
    completedSteps: 0,
    totalSteps:     agentsData.length,
    results:        agentsData.map(agent => ({
      agentId:  agent.id,
      status:   'pending',
      duration: null,
      tokens:   null,
      outputId: null,
    })),
  };
  historyData.unshift(newRun);
  currentRunIndex = 0;
};

/** 전체 렌더링 */
const renderAll = () => {
  renderRunPanel();
};

/* ─── 우측 실행 패널 렌더링 ─── */
const renderRunPanel = () => {
  renderRunTabs();
  renderResultList();
  renderTokenBars();
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

  container.innerHTML = tabsHTML;

  container.querySelectorAll('.run-tab[data-run-index]').forEach(tab => {
    tab.addEventListener('click', () => {
      currentRunIndex = parseInt(tab.dataset.runIndex, 10);
      /* 해당 탭의 에이전트 스냅샷이 있으면 agentsData 복원 */
      const run = historyData[currentRunIndex];
      if (run?.agentsSnapshot?.length > 0) agentsData = run.agentsSnapshot;
      renderRunPanel();
    });
  });

  /* 활성 탭을 컨테이너 중앙으로 스크롤 */
  const activeTab = container.querySelector('.run-tab.active');
  if (activeTab) {
    const tabCenter   = activeTab.offsetLeft + activeTab.offsetWidth / 2;
    const scrollLeft  = tabCenter - container.clientWidth / 2;
    container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
  }
};

/** 결과 리스트 렌더링 (rr-card 카드형) */
const renderResultList = () => {
  const container = document.getElementById('run-result-list');
  if (!container) return;

  const currentRun = historyData[currentRunIndex];
  if (!currentRun) {
    container.innerHTML = `
      <div class="result-empty-state">
        <div class="result-empty-icon">▶</div>
        <div class="result-empty-title">아직 실행 결과가 없습니다</div>
        <div class="result-empty-desc">에이전시 페이지로 이동해서<br>본인에 맞는 <strong>에이전시 팀을 구성</strong>하세요</div>
        <a href="${PAGES_ROOT}agents.html" class="result-empty-link">에이전트 설정 →</a>
      </div>
    `;
    return;
  }

  const listHTML = currentRun.results.map((result, idx) => {
    const agent = agentsData.find(a => a.id === result.agentId);
    if (!agent) return '';

    const color = STEP_PALETTE[idx % STEP_PALETTE.length];

    /* 상태별 체크 아이콘 */
    let checkHTML = '';
    if (result.status === 'done') {
      checkHTML = `<div class="rr-check done">✓</div>`;
    } else if (result.status === 'running') {
      checkHTML = `<div class="rr-check running"><div class="es-dot"></div></div>`;
    } else {
      checkHTML = `<div class="rr-check pending">–</div>`;
    }

    /* 소요 시간 */
    const timeText = result.status === 'done'
      ? `${result.duration}s`
      : result.status === 'running'
        ? `<span style="color:var(--accent-pipe)">...</span>`
        : '—';

    /* 직급 라벨 — 대기 중: 현재 Store 오버라이드(최신 설정), 실행/완료: 스냅샷(당시 직급 보존) */
    const rankLabel = currentRun.status === 'pending'
      ? getAgentRankLabel(agent, Store.get())
      : agent.rank;

    return `
      <div class="rr-card ${result.status}" data-output-id="${result.outputId}" data-agent-id="${result.agentId}"
           role="button" tabindex="0" aria-label="${agent.name} 결과 보기">
        <div class="rr-left">${checkHTML}</div>
        <div class="rr-body">
          <div class="rr-top">
            <span class="rr-icon">${agent.icon}</span>
            <span class="rr-name" style="color:${color}">${agent.name.toUpperCase()}</span>
            <span class="rr-role">${rankLabel}</span>
          </div>
          <div class="rr-file">→ 📄 ${agent.outputFile}</div>
        </div>
        <div class="rr-time">${timeText}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = listHTML;

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
  if (!currentRun) {
    /* 에이전트 이름만 있는 빈 바 표시 */
    container.innerHTML = agentsData.map((agent, idx) => {
      const color = STEP_PALETTE[idx % STEP_PALETTE.length];
      return `
        <div class="token-row">
          <div class="token-label" style="color:${color};font-family:var(--font-mono);text-transform:uppercase;font-size:10px;">${agent.name}</div>
          <div class="token-bar"><div class="token-fill" style="width:0%;background:${color}"></div></div>
          <div class="token-val" style="color:var(--text-dim)">—</div>
        </div>
      `;
    }).join('');
    return;
  }

  /* 전체 최대값 기준으로 % 계산 */
  const maxTokens = Math.max(...currentRun.results.map(r => r.tokens || 0), 1);

  const barsHTML = currentRun.results.map((result, idx) => {
    const agent = agentsData.find(a => a.id === result.agentId);
    if (!agent) return '';

    const color = STEP_PALETTE[idx % STEP_PALETTE.length];
    const pct = result.tokens ? Math.round((result.tokens / maxTokens) * 100) : 0;
    const valText = result.tokens ? result.tokens.toLocaleString() : '—';

    return `
      <div class="token-row">
        <div class="token-label" style="color:${color};font-family:var(--font-mono);text-transform:uppercase;font-size:10px;">${agent.name}</div>
        <div class="token-bar">
          <div class="token-fill" data-width="${pct}" style="width:0%;background:${color}"></div>
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


/* ─── 프로바이더 감지 (모델명 기반) ─── */
const detectProvider = (model) => {
  if (!model) return 'claude';
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  return 'custom';
};

/* ─── Claude API 호출 ─── */
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

/* ─── OpenAI API 호출 ─── */
const callOpenAIAPI = async (prompt, model, apiKey) => {
  const isOpenAI = model && (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3'));
  const openaiModel = isOpenAI ? model : 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
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
    text:   data.choices[0].message.content,
    tokens: (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0),
  };
};

/* ─── 커스텀 OpenAI-compatible API 호출 ─── */
const callCustomAPI = async (prompt, model, apiKey, endpoint) => {
  if (!endpoint) throw new Error('커스텀 엔드포인트가 설정되지 않았습니다');
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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
    text:   data.choices[0].message.content,
    tokens: (data.usage?.prompt_tokens || 0) + (data.usage?.completion_tokens || 0),
  };
};

/* ─── 프로바이더에 따라 올바른 API 호출 (Store에서 키 자동 선택) ─── */
const callAI = async (prompt, model, stepCustomModelId) => {
  const state    = Store.get();
  const apiKeys  = state.apiKeys || {};
  const provider = detectProvider(model);

  /* 해당 provider 키가 있으면 정상 호출 */
  if (provider === 'openai' && apiKeys.openai)
    return callOpenAIAPI(prompt, model, apiKeys.openai);
  if (provider === 'custom' && apiKeys.custom) {
    const effectiveModel = stepCustomModelId || state.customModelId || 'llama-3.1-70b';
    return callCustomAPI(prompt, effectiveModel, apiKeys.custom, state.customApiEndpoint || '');
  }
  if (provider === 'claude' && apiKeys.claude)
    return callClaudeAPI(prompt, model, apiKeys.claude);

  /* ── 폴백: 해당 provider 키 없으면 사용 가능한 키로 대체 ── */
  if (apiKeys.openai)
    return callOpenAIAPI(prompt, 'gpt-4o-mini', apiKeys.openai);
  if (apiKeys.claude)
    return callClaudeAPI(prompt, 'claude-haiku-4-5', apiKeys.claude);
  if (apiKeys.custom && state.customApiEndpoint) {
    const effectiveModel = stepCustomModelId || state.customModelId || 'llama-3.1-70b';
    return callCustomAPI(prompt, effectiveModel, apiKeys.custom, state.customApiEndpoint);
  }

  throw new Error('사용 가능한 API 키 없음');
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

/** 단일 스텝 HTML 빌드 — exec bar 단계 패널에서 사용 */
const buildStepHTML = (agent, status, result, isLast, state, idx) => {
  const color = STEP_PALETTE[idx % STEP_PALETTE.length];

  const override = state.agentOverrides[agent.id];
  const rawModel    = (override && override.model) ? override.model : agent.model;
  /* 해당 에이전트의 native provider 키가 없으면 사용 가능한 키의 기본 모델로 표시 */
  const apiKeys     = state.apiKeys || {};
  const nativeProv  = detectProvider(rawModel);
  const hasNativeKey = (nativeProv === 'claude' && !!apiKeys.claude) ||
    (nativeProv === 'openai' && !!apiKeys.openai) ||
    (nativeProv === 'custom' && !!apiKeys.custom);
  let modelName = rawModel;
  if (!hasNativeKey && !(override && override.model)) {
    if (apiKeys.openai)  modelName = 'gpt-4o-mini';
    else if (apiKeys.claude) modelName = 'claude-haiku-4-5';
    else if (apiKeys.custom) modelName = state.customModelId || 'custom';
  }

  const rankData = (override && override.rank && RANK_MAP[override.rank])
    ? RANK_MAP[override.rank]
    : { label: agent.rank, icon: agent.rankIcon };

  const circleClass = status === 'running' ? 'es-circle es-running' : 'es-circle';
  const circleStyle = `border-color:${color};background:${color}15;--es-color:${color}50`;
  const connector = isLast ? '' : `<div class="es-connector"></div>`;

  let actionsHTML = '';
  if (status === 'running') {
    actionsHTML = `<span class="es-status st-running"><div class="es-dot"></div> 실행 중</span>`;
  } else if (status === 'done') {
    actionsHTML = `<span class="es-status st-done">✓ 완료</span>`;
  } else {
    actionsHTML = `
      <span class="step-tag tag-run" data-agent="${agent.id}" role="button" aria-label="${agent.name} 단독 실행">실행</span>
      <span class="step-tag tag-edit" data-agent="${agent.id}" role="button" aria-label="${agent.name} 프롬프트 편집">편집</span>
    `;
  }

  const fileStatusClass = status === 'done' ? 'st-done' : status === 'running' ? 'st-running' : 'st-pending';
  const fileStatusText  = status === 'done' ? '완료' : status === 'running' ? '생성 중...' : '대기';
  const itemClass = status === 'pending' ? 'es-item es-pending' : status === 'running' ? 'es-item es-running' : 'es-item es-done';

  return `
    <div class="${itemClass}" data-agent="${agent.id}" data-status="${status}">
      <div class="es-left">
        <div class="${circleClass}" style="${circleStyle}" aria-label="${agent.name} 에이전트">${agent.icon}</div>
        ${connector}
      </div>
      <div class="es-body">
        <div class="es-main">
          <div class="es-info">
            <span class="es-name" style="color:${color}">${agent.name.toUpperCase()}</span>
            <span class="es-badge" style="color:${color};border-color:${color}35;background:${color}12">${rankData.icon} ${rankData.label}</span>
            <span class="es-model">${modelName}</span>
          </div>
          <div class="es-actions">${actionsHTML}</div>
        </div>
        <div class="es-output">
          <span class="es-output-arrow">→</span>
          <span class="es-filename">📄 ${agent.outputFile}</span>
          <span class="es-file-status ${fileStatusClass}">${fileStatusText}</span>
        </div>
      </div>
    </div>
  `;
};

/* ─── 하단 실행 바 ─── */

/** 실행 바 DOM 초기화 (body에 단 한 번 생성) */
const initExecBar = () => {
  if (document.getElementById('exec-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'exec-bar';
  bar.className = 'exec-bar';
  bar.style.display = 'none';
  bar.innerHTML = `
    <div class="exec-bar-header">
      <span class="exec-bar-label" id="exec-bar-label">파이프라인 실행</span>
      <div class="exec-bar-items" id="exec-bar-items"></div>
      <button class="exec-bar-toggle" id="exec-bar-toggle" title="단계 패널 접기/펼치기">▼</button>
      <button class="exec-chip-close" id="exec-bar-close" title="닫기">×</button>
    </div>
    <div class="exec-detail-panel" id="exec-detail-panel">
      <div class="exec-detail-header">
        <span class="exec-detail-label">단계별 실행 현황</span>
        <button class="exec-detail-close" id="exec-detail-close">×</button>
      </div>
      <div class="exec-steps-list" id="exec-steps-list"></div>
    </div>
  `;
  document.body.appendChild(bar);

  /* 패널 토글 */
  document.getElementById('exec-bar-toggle').addEventListener('click', toggleExecPanel);
  document.getElementById('exec-detail-close').addEventListener('click', toggleExecPanel);

  /* 바 닫기 */
  document.getElementById('exec-bar-close').addEventListener('click', hideExecBar);
};

/** 실행 바 패널 열기/닫기 토글 */
const toggleExecPanel = () => {
  const panel  = document.getElementById('exec-detail-panel');
  const toggle = document.getElementById('exec-bar-toggle');
  if (!panel || !toggle) return;
  const isClosed = panel.classList.toggle('closed');
  toggle.textContent = isClosed ? '▲' : '▼';
  /* 트랜지션(0.3s) 후 패딩 재계산 */
  setTimeout(adjustMainPadding, 320);
};

/** 실행 바 표시 + main 하단 패딩 확보 */
const showExecBar = () => {
  initExecBar();
  const bar = document.getElementById('exec-bar');
  if (!bar) return;
  bar.style.display = 'flex';
  document.body.classList.add('exec-bar-visible');
  /* 패널 기본 열린 상태 */
  const panel  = document.getElementById('exec-detail-panel');
  const toggle = document.getElementById('exec-bar-toggle');
  if (panel)  panel.classList.remove('closed');
  if (toggle) toggle.textContent = '▼';
  requestAnimationFrame(adjustMainPadding);
};

/** 실행 바 숨김 */
const hideExecBar = () => {
  const bar  = document.getElementById('exec-bar');
  const main = document.querySelector('.main');
  if (bar)  bar.style.display = 'none';
  if (main) main.style.paddingBottom = '';
  document.body.classList.remove('exec-bar-visible');
};

/** main 콘텐츠 하단 패딩 = 실행 바 높이 */
const adjustMainPadding = () => {
  const bar  = document.getElementById('exec-bar');
  const main = document.querySelector('.main');
  if (!bar || !main || bar.style.display === 'none') return;
  main.style.paddingBottom = `${bar.offsetHeight + 16}px`;
};

/** 칩 행 전체 렌더링 */
const renderExecChips = (startIdx) => {
  const container = document.getElementById('exec-bar-items');
  if (!container) return;

  container.innerHTML = agentsData.map((agent, idx) => {
    const color  = STEP_PALETTE[idx % STEP_PALETTE.length];
    const isDone = idx < startIdx;
    return `
      <div class="exec-chip${isDone ? ' active' : ''}" id="exec-chip-${agent.id}">
        <div class="exec-chip-icon" style="background:${color}15;color:${color}">${agent.icon}</div>
        <div class="exec-chip-info">
          <div class="exec-chip-name">${agent.name}</div>
          <div class="exec-chip-progress" id="exec-chip-prog-${agent.id}">${isDone ? '완료됨' : '대기 중'}</div>
        </div>
        <span class="exec-chip-badge ${isDone ? 'done' : 'waiting'}" id="exec-chip-badge-${agent.id}">${isDone ? '완료' : '대기'}</span>
      </div>
    `;
  }).join('');
};

/** 단계 상세 패널 전체 렌더링 */
const renderExecSteps = (startIdx) => {
  const container = document.getElementById('exec-steps-list');
  if (!container) return;

  const state = Store.get();
  container.innerHTML = agentsData.map((agent, idx) => {
    const status = idx < startIdx ? 'done' : 'pending';
    const isLast = idx === agentsData.length - 1;
    return buildStepHTML(agent, status, null, isLast, state, idx);
  }).join('');
};

/** 특정 스텝의 칩·패널 업데이트 */
const updateExecStep = (agentId, status, idx, duration) => {
  /* 칩 상태 업데이트 */
  const chip  = document.getElementById(`exec-chip-${agentId}`);
  const badge = document.getElementById(`exec-chip-badge-${agentId}`);
  const prog  = document.getElementById(`exec-chip-prog-${agentId}`);

  if (chip) {
    chip.classList.toggle('active', status === 'running');
    /* 실행 중 칩 좌우 스크롤 */
    if (status === 'running') chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
  if (badge) {
    const cls = status === 'running' ? 'running' : status === 'done' ? 'done' : 'waiting';
    badge.className = `exec-chip-badge ${cls}`;
    badge.textContent = status === 'running' ? '실행 중' : status === 'done' ? '완료' : '대기';
  }
  if (prog) {
    prog.textContent = status === 'running'
      ? '처리 중...'
      : status === 'done' ? (duration ? `${duration}s 완료` : '완료됨') : '대기 중';
  }

  /* 단계 패널 해당 항목 교체 */
  const stepsContainer = document.getElementById('exec-steps-list');
  if (stepsContainer) {
    const agent = agentsData.find(a => a.id === agentId);
    if (agent) {
      const isLast  = idx === agentsData.length - 1;
      const newHTML = buildStepHTML(agent, status, null, isLast, Store.get(), idx);
      const existing = stepsContainer.querySelector(`[data-agent="${agentId}"]`);
      if (existing) {
        const tmp = document.createElement('div');
        tmp.innerHTML = newHTML;
        existing.replaceWith(tmp.firstElementChild);
      }
    }
  }

  /* 바 레이블 업데이트 */
  const label = document.getElementById('exec-bar-label');
  if (label && status === 'running') {
    label.textContent = `실행 중 · ${idx + 1} / ${agentsData.length} 단계`;
  }

  adjustMainPadding();
};

/* ─── 파이프라인 실행 ─── */
const simulateRun = async (startAgentId) => {
  if (isRunning) return;
  isRunning = true;

  /* 현재 탭이 pending 상태이면 라벨을 상속하고 제거 (실제 런으로 교체) */
  let inheritLabel = null;
  if (historyData[currentRunIndex]?.status === 'pending') {
    inheritLabel = historyData[currentRunIndex].label;
    historyData.splice(currentRunIndex, 1);
  }

  const runBtn = document.getElementById('run-btn-header');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = '⏳ 실행 중...'; }

  /* 실행 시점의 최신 오버라이드(직급·모델 등)를 agentsData에 반영 — 재방문 후 변경된 설정 동기화 */
  const runOverrides = Store.get().agentOverrides || {};
  agentsData = agentsData.map(agent => {
    const ov = runOverrides[agent.id] || {};
    if (!ov.rank) return agent;
    const rd = RANK_MAP[ov.rank];
    if (!rd) return agent;
    return { ...agent, rank: rd.label, rankIcon: rd.icon };
  });

  const startIdx = startAgentId ? agentsData.findIndex(a => a.id === startAgentId) : 0;

  const newRun = {
    id: `run-${Date.now()}`,
    label: inheritLabel || `${historyData.length + 1}차 실행`,
    status: 'running',
    agentsSnapshot: JSON.parse(JSON.stringify(agentsData)), // 페이지 재방문 시 에이전트 복원용
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

  /* 하단 실행 바 표시 */
  showExecBar();
  renderExecChips(startIdx);
  renderExecSteps(startIdx);
  requestAnimationFrame(adjustMainPadding);

  /* 크레딧 사전 체크 (API 키 없을 때만) */
  const preState  = Store.get();
  const apiKeys   = preState.apiKeys || {};
  const hasAnyKey = !!(apiKeys.claude || apiKeys.openai || apiKeys.custom);

  if (!hasAnyKey) {
    const requiredCredits = agentsData.slice(startIdx).reduce((sum, agent) => {
      return sum + calcCredits(RANK_TOKEN_LIMITS[getAgentRankLabel(agent, preState)] || 2000);
    }, 0);
    if (preState.tokenBalance < requiredCredits) {
      alert(`크레딧이 부족합니다.\n필요: ${requiredCredits} 크레딧 / 잔여: ${preState.tokenBalance} 크레딧`);
      isRunning = false;
      hideExecBar();
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
    updateExecStep(agent.id, 'running', i);

    let generatedContent = '';
    let tokens = 0;
    const t0 = Date.now();

    /* 이 스텝의 모델과 프로바이더 결정 */
    const effectiveModel = (override && override.model) ? override.model : agent.model;
    const stepProvider   = detectProvider(effectiveModel);
    const stepApiKeys    = Store.get().apiKeys || {};
    const stepEndpoint   = Store.get().customApiEndpoint || '';
    const hasStepKey     = (
      (stepProvider === 'claude'  && !!stepApiKeys.claude) ||
      (stepProvider === 'openai'  && !!stepApiKeys.openai) ||
      (stepProvider === 'custom'  && !!stepApiKeys.custom && !!stepEndpoint)
    );
    /* 폴백: 해당 provider 키 없어도 다른 키가 존재하면 callAI 진입 허용 */
    const anyKeyExists = !!stepApiKeys.claude || !!stepApiKeys.openai ||
      (!!stepApiKeys.custom && !!stepEndpoint);
    /* 커스텀 모델명: pipeline-editor stepCustomModelId → agents.js override → Store customModelId 순서로 폴백 */
    const stepCustomModelId = agent.stepCustomModelId || override.customModelName || '';

    if (hasStepKey || anyKeyExists) {
      /* ── 실제 AI 생성 ── */
      try {
        const result    = await callAI(resolvedPrompt, effectiveModel, stepCustomModelId);
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
    updateExecStep(agent.id, 'done', i, duration);
  }

  newRun.status      = 'completed';
  newRun.completedAt = new Date().toISOString();
  Store.set({ activeRunStep: null, pipelineStatus: 'completed' });

  /* 실행 바 완료 상태 표시 */
  const execLabel = document.getElementById('exec-bar-label');
  if (execLabel) {
    execLabel.textContent = `✓ 파이프라인 완료 · ${agentsData.length}단계`;
    execLabel.style.color = '#4ade80';
  }

  /* 생성 결과물 localStorage 영속 저장 */
  const st = Store.get();
  Store.set({
    generatedRuns:    [newRun,          ...(st.generatedRuns    || [])],
    generatedOutputs: [...newRunOutputs, ...(st.generatedOutputs || [])],
  });

  renderRunPanel();

  isRunning = false;
  if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ 전체 실행'; }
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
  /* ── 하위 호환 마이그레이션: 구 apiKey → apiKeys.claude / apiKeys.openai ── */
  const legacyKey = Store.get().apiKey || '';
  if (legacyKey) {
    const existing = Store.get().apiKeys || {};
    if (!existing.claude && !existing.openai) {
      if (legacyKey.startsWith('sk-ant-')) {
        Store.set({ apiKeys: { ...existing, claude: legacyKey } });
      } else if (legacyKey.startsWith('sk-')) {
        Store.set({ apiKeys: { ...existing, openai: legacyKey } });
      }
    }
  }

  init();

  /* 전체 실행 버튼 이벤트 */
  document.getElementById('run-btn-header')?.addEventListener('click', () => simulateRun());

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

  /* 샘플 데이터 불러오기 버튼 */
  document.getElementById('load-sample-btn')?.addEventListener('click', () => {
    /* Store 저장 */
    Store.set({ userInput: SAMPLE_DATA.userInput, brandInfo: SAMPLE_DATA.brandInfo });

    /* DOM 동기화 — 프로젝트 요청 */
    if (userInputArea) userInputArea.value = SAMPLE_DATA.userInput;

    /* DOM 동기화 — 브랜드 필드 */
    brandFields.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) el.value = SAMPLE_DATA.brandInfo[key] || '';
    });

  });


  /* 전역 툴팁 오버레이 초기화 (agents.js와 동일 패턴, 중복 방지) */
  if (!document.getElementById('tt-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'tt-overlay';
    document.body.appendChild(overlay);

    /* 클릭으로 툴팁 토글 */
    document.addEventListener('click', (e) => {
      const icon = e.target.closest('.tooltip-icon');
      if (icon) {
        const popup = icon.parentElement?.querySelector('.tooltip-popup');
        if (!popup) return;
        /* 이미 열려있으면 닫기 */
        if (overlay.classList.contains('visible')) {
          overlay.classList.remove('visible');
          return;
        }
        overlay.innerHTML = popup.innerHTML;
        const rect = icon.getBoundingClientRect();
        const overlayW = 260;
        let left = rect.left + rect.width / 2 - overlayW / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - overlayW - 8));
        overlay.style.top  = `${rect.bottom + 6}px`;
        overlay.style.left = `${left}px`;
        overlay.classList.add('visible');
        e.stopPropagation();
      } else if (!e.target.closest('#tt-overlay')) {
        /* 툴팁 오버레이 외부 클릭 시 닫기 */
        overlay.classList.remove('visible');
      }
    });
  }

  /* Provider 탭 이벤트 등록 (api-key-card가 있는 환경에서만 동작) */
  document.querySelectorAll('.provider-tab').forEach(btn => {
    btn.addEventListener('click', () => applyProviderTab(btn.dataset.provider));
  });

  /* API 키 UI 초기화 (탭 상태 포함) */
  applyProviderTab(selectedProvider);
  updateApiKeyUI();

  /* 컴팩트 상태 배너 초기화 (index.html) */
  updateStatusBanner();

  /* API 키 저장 버튼 */
  document.getElementById('api-key-save-btn')?.addEventListener('click', () => {
    const input = document.getElementById('api-key-input');
    if (!input) return;
    const key = input.value.trim();

    const state   = Store.get();
    const apiKeys = state.apiKeys || {};

    if (selectedProvider === 'custom') {
      /* 커스텀: 엔드포인트·모델명도 함께 저장 */
      const endpointInput = document.getElementById('custom-endpoint-input');
      const modelInput    = document.getElementById('custom-model-input');
      Store.set({
        apiKeys: { ...apiKeys, custom: key },
        customApiEndpoint: endpointInput?.value.trim() || '',
        customModelId:     modelInput?.value.trim()    || '',
      });
    } else {
      /* claude / openai */
      Store.set({ apiKeys: { ...apiKeys, [selectedProvider]: key } });
    }

    updateApiKeyUI();
    input.value = '';
  });

  /* API 키 삭제 버튼 (현재 선택된 프로바이더 키 삭제) */
  document.getElementById('api-key-clear-btn')?.addEventListener('click', () => {
    const state   = Store.get();
    const apiKeys = state.apiKeys || {};
    Store.set({ apiKeys: { ...apiKeys, [selectedProvider]: '' } });
    updateApiKeyUI();
  });
});

/** API 키 상태 UI 업데이트 (레거시 — api-key-card가 있는 환경용) */
const updateApiKeyUI = () => {
  const statusEl  = document.getElementById('api-key-status');
  const clearBtn  = document.getElementById('api-key-clear-btn');
  const inputEl   = document.getElementById('api-key-input');
  const state     = Store.get();
  const apiKeys   = state.apiKeys || {};

  /* 연결된 프로바이더 목록 */
  const connectedLabels = [
    apiKeys.claude ? 'Claude' : null,
    apiKeys.openai ? 'OpenAI' : null,
    apiKeys.custom ? '커스텀' : null,
  ].filter(Boolean);
  const hasAnyKey = connectedLabels.length > 0;

  /* 연결 상태 배지 */
  if (statusEl) {
    statusEl.className = `api-key-status ${hasAnyKey ? 'connected' : 'disconnected'}`;
    statusEl.textContent = hasAnyKey
      ? `● ${connectedLabels.join(' · ')} 연결됨`
      : '○ 미연결 (목업 모드)';
  }

  /* 삭제 버튼: 현재 탭 프로바이더에 키가 있을 때만 표시 */
  const curProviderHasKey = !!(apiKeys[selectedProvider] || '');
  if (clearBtn) clearBtn.style.display = curProviderHasKey ? 'inline-flex' : 'none';

  if (curProviderHasKey) {
    if (inputEl) inputEl.placeholder = '새 키로 교체하려면 입력...';
  } else {
    /* 현재 탭 기준으로 placeholder·링크 복원 */
    applyProviderTab(selectedProvider);
  }

  /* 컴팩트 상태 배너 업데이트 (index.html) */
  updateStatusBanner();
};

/** 컴팩트 상태 배너 업데이트 (index.html의 #api-status-indicator) */
const updateStatusBanner = () => {
  const indicator = document.getElementById('api-status-indicator');
  if (!indicator) return;
  const apiKeys = Store.get().apiKeys || {};
  const connectedLabels = [
    apiKeys.claude ? 'Claude' : null,
    apiKeys.openai ? 'OpenAI' : null,
    apiKeys.custom ? '커스텀' : null,
  ].filter(Boolean);
  const hasAnyKey = connectedLabels.length > 0;
  indicator.className = hasAnyKey ? 'connected' : '';
  indicator.textContent = hasAnyKey
    ? `● ${connectedLabels.join(' · ')} 연결됨`
    : '○ 연결 안됨 (목업 모드)';
};
