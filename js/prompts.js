/* ========================================
   Prompts JS — 프롬프트 편집 페이지 로직
   에이전트 탭 전환 + 프롬프트 저장
   ======================================== */

'use strict';

let agentsData = [];
let activeAgentId = null;

/* ─── 직급 value → label 변환 맵 ─── */
const RANK_MAP = {
  intern:    { label: '인턴',     icon: '🔰' },
  junior:    { label: '신입사원', icon: '🌱' },
  associate: { label: '대리',     icon: '🖥' },
  manager:   { label: '과장',     icon: '⭐' },
  lead:      { label: '팀장',     icon: '👑' },
  director:  { label: '부장',     icon: '🏆' },
};

/** 오버라이드 우선으로 직급 데이터 반환 */
const getRankData = (agent, override) => {
  if (override && override.rank && RANK_MAP[override.rank]) {
    return RANK_MAP[override.rank];
  }
  return { label: agent.rank, icon: agent.rankIcon };
};

/* ─── 경로 설정 ─── */
const IS_SUB_PROMPTS   = window.location.pathname.includes('/pages/');
const PROMPTS_DATA_ROOT = IS_SUB_PROMPTS ? '../data/' : './data/';

/* ─── 컨텍스트 변수: 로드된 에이전트의 outputFile 기반으로 동적 생성 ─── */
let CONTEXT_VARS = [];

const buildContextVars = (agents) => {
  const base = [
    { code: '{{user_input}}', desc: '프로젝트 요청 입력 내용' },
    { code: '{{brand_info}}', desc: '클라이언트 정보 (브랜드명·컬러·톤앤매너 등)' },
  ];
  const agentVars = agents.map(a => ({
    code: `{{${a.outputFile}}}`,
    desc: `${a.name}이 생성한 ${a.desc}`,
  }));
  return [...base, ...agentVars];
};

/* ─── 초기화 ─── */
const init = async () => {
  try {
    /* Store에서 선택된 에이전시 파일 읽기 */
    const agentsFile = Store.get().selectedAgency || 'agents.json';
    const data = await fetchJSON(`${PROMPTS_DATA_ROOT}${agentsFile}`);
    agentsData = data.agents;

    /* 로드된 에이전트 기반 컨텍스트 변수 빌드 */
    CONTEXT_VARS = buildContextVars(agentsData);

    /* URL 파라미터로 초기 탭 결정 */
    const params = new URLSearchParams(window.location.search);
    activeAgentId = params.get('agent') || agentsData[0]?.id;

    renderTabs();
    renderEditor();
    renderSidePanel();
  } catch (e) {
    console.error('에이전트 데이터 로드 실패:', e);
  }
};

/** JSON fetch 헬퍼 */
const fetchJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch 실패: ${url}`);
  return res.json();
};

/* ─── 에이전트 탭 렌더링 ─── */
const renderTabs = () => {
  const container = document.getElementById('agent-tabs');
  if (!container) return;

  const state = Store.get();

  const tabsHTML = agentsData.map(agent => {
    const isActive = agent.id === activeAgentId;
    const override = state.agentOverrides[agent.id];
    const rankData = getRankData(agent, override);
    return `
      <div class="agent-tab${isActive ? ' active' : ''}" data-agent="${agent.id}"
           role="tab" aria-selected="${isActive}" tabindex="${isActive ? 0 : -1}">
        <span class="tab-icon">${agent.icon}</span>
        ${agent.name}
        <span class="rank-badge tab-badge" style="background:var(${agent.glowVar});color:var(${agent.accentVar})">${rankData.icon} ${rankData.label}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = tabsHTML;

  container.querySelectorAll('.agent-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.agent));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') switchTab(tab.dataset.agent);
    });
  });
};

/** 탭 전환 */
const switchTab = (agentId) => {
  /* 현재 편집 중인 프롬프트 자동 저장 */
  autoSave();
  activeAgentId = agentId;
  renderTabs();
  renderEditor();
};

/* ─── 편집기 렌더링 ─── */
const renderEditor = () => {
  const card = document.getElementById('editor-card');
  if (!card) return;

  const agent = agentsData.find(a => a.id === activeAgentId);
  if (!agent) return;

  const state = Store.get();
  const override = state.agentOverrides[activeAgentId] || {};
  /* promptOverrides 우선, 없으면 agentOverrides의 systemPrompt, 없으면 JSON 기본값 */
  const savedPrompt = state.promptOverrides[activeAgentId]
    ?? override.systemPrompt
    ?? agent.systemPrompt
    ?? '';
  const rankData = getRankData(agent, override);

  card.innerHTML = `
    <div class="editor-header">
      <div class="editor-title">${agent.icon} ${agent.name} 시스템 프롬프트</div>
      <div class="editor-meta">
        <span style="color:var(${agent.accentVar})">${rankData.icon} ${rankData.label}</span>
        <span id="token-estimate" class="token-estimate">약 <span>${estimateTokens(savedPrompt)}</span> 토큰</span>
      </div>
    </div>
    <div class="editor-body">
      <textarea
        class="prompt-textarea"
        id="prompt-textarea"
        placeholder="시스템 프롬프트를 입력하세요..."
        aria-label="${agent.name} 시스템 프롬프트 편집"
        spellcheck="false"
      >${savedPrompt}</textarea>
    </div>
    <div class="editor-footer">
      <div class="editor-footer-left">
        <div class="token-estimate">토큰 추정: <span id="token-count">${estimateTokens(savedPrompt)}</span></div>
        <button class="btn btn-ghost btn-sm" id="reset-prompt-btn" aria-label="기본값으로 초기화">
          초기화
        </button>
      </div>
      <button class="btn btn-primary btn-sm" id="save-prompt-btn" aria-label="프롬프트 저장">
        저장
      </button>
    </div>
  `;

  /* 실시간 토큰 추정 + 자동 저장 */
  const textarea = card.querySelector('#prompt-textarea');
  const tokenCount = card.querySelector('#token-count');
  textarea.addEventListener('input', () => {
    tokenCount.textContent = estimateTokens(textarea.value);
    autoSave();
  });

  /* 저장 버튼 */
  card.querySelector('#save-prompt-btn').addEventListener('click', () => {
    savePrompt();
    showToast(`${agent.name} 프롬프트가 저장되었습니다`);
  });

  /* 초기화 버튼 */
  card.querySelector('#reset-prompt-btn').addEventListener('click', () => {
    if (confirm(`${agent.name} 프롬프트를 기본값으로 초기화하시겠습니까?`)) {
      textarea.value = agent.systemPrompt || '';
      tokenCount.textContent = estimateTokens(textarea.value);
    }
  });
};

/* ─── 사이드 패널 렌더링 ─── */
const renderSidePanel = () => {
  const varContainer = document.getElementById('variable-chips');
  if (!varContainer) return;

  const chipsHTML = CONTEXT_VARS.map(v => `
    <div class="variable-chip" data-var="${v.code}" role="button" tabindex="0"
         aria-label="${v.code} 삽입">
      <span class="variable-chip-code">${v.code}</span>
      <span class="variable-chip-desc">${v.desc}</span>
    </div>
  `).join('');

  varContainer.innerHTML = chipsHTML;

  /* 클릭 시 textarea에 변수 삽입 */
  varContainer.querySelectorAll('.variable-chip').forEach(chip => {
    chip.addEventListener('click', () => insertVariable(chip.dataset.var));
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') insertVariable(chip.dataset.var);
    });
  });

  /* 변수 설명 렌더링 */
  const infoContainer = document.getElementById('variable-info');
  if (!infoContainer) return;

  const infoHTML = CONTEXT_VARS.map(v => `
    <div class="variable-info-item">
      <div class="variable-info-code">${v.code}</div>
      <div class="variable-info-desc">${v.desc}</div>
    </div>
  `).join('');

  infoContainer.innerHTML = infoHTML;
};

/** textarea에 변수 삽입 (커서 위치) */
const insertVariable = (varCode) => {
  const textarea = document.getElementById('prompt-textarea');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);

  textarea.value = `${before}${varCode}${after}`;
  textarea.selectionStart = start + varCode.length;
  textarea.selectionEnd = start + varCode.length;
  textarea.focus();

  /* 토큰 추정 갱신 */
  const tokenCount = document.getElementById('token-count');
  if (tokenCount) tokenCount.textContent = estimateTokens(textarea.value);
};

/** 현재 편집 내용 자동 저장 */
const autoSave = () => {
  const textarea = document.getElementById('prompt-textarea');
  if (!textarea || !activeAgentId) return;
  Store.setPromptOverride(activeAgentId, textarea.value);
};

/** 프롬프트 저장 */
const savePrompt = () => {
  autoSave();
};

/** 토큰 추정: 글자 수 ÷ 4 (간단 근사) */
const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

/** 토스트 메시지 */
const showToast = (message) => {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = `✓ ${message}`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
};

/* ─── DOM 준비 후 초기화 ─── */
document.addEventListener('DOMContentLoaded', init);

/* 새로고침/탭 닫기 직전 마지막 저장 */
window.addEventListener('beforeunload', autoSave);
