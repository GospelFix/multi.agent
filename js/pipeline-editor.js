/* ========================================
   Pipeline Editor JS — 파이프라인 편집기 로직
   에이전트 추가·삭제·순서변경·컨텍스트 설정
   ======================================== */

'use strict';

/* ─── 상태 ─── */
let agentsPool = [];     // 현재 에이전시의 전체 에이전트 목록 (선택 풀)
let currentSteps = [];   // 편집 중인 스텝 배열
let dragSrcIdx = -1;     // 드래그 중인 스텝 인덱스

/* ─── 경로 ─── */
const IS_SUB = window.location.pathname.includes('/pages/');
const DATA_ROOT = IS_SUB ? '../data/' : './data/';

/* ─── 모델 목록 (에이전트 셀렉터에 사용) ─── */
const ALL_MODELS = [
  { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-6',   label: 'Claude Opus 4.6' },
  { value: 'gpt-4o',            label: 'GPT-4o' },
  { value: 'gpt-4o-mini',       label: 'GPT-4o Mini' },
  { value: 'o1-mini',           label: 'O1 Mini' },
];

/* ─── 직급 목록 ─── */
const RANK_LIST = [
  { value: '인턴',     icon: '🔰' },
  { value: '신입사원', icon: '🌱' },
  { value: '대리',     icon: '🖥' },
  { value: '과장',     icon: '⭐' },
  { value: '팀장',     icon: '👑' },
  { value: '부장',     icon: '🏆' },
];

/* ─── JSON fetch 헬퍼 ─── */
const fetchJSON = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch 실패: ${url}`);
  return res.json();
};

/* ─── 에이전트 풀 로드 ─── */
const loadAgentsPool = async () => {
  const agencyFile = Store.get().selectedAgency || 'agents.json';
  try {
    const data = await fetchJSON(`${DATA_ROOT}${agencyFile}`);
    agentsPool = data.agents || [];
  } catch {
    agentsPool = [];
  }
};

/* ─── 현재 파이프라인 로드 (커스텀 → 기본 에이전시 순서) ─── */
const loadCurrentPipeline = async () => {
  const stored = Store.get();
  const custom = stored.customPipeline;

  if (custom?.steps?.length) {
    /* 커스텀 파이프라인이 있으면 그대로 복원 */
    const agentsMap = Object.fromEntries(agentsPool.map(a => [a.id, a]));
    currentSteps = custom.steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(step => {
        const base = agentsMap[step.agentId] || agentsPool[0];
        return {
          agentId:      step.agentId,
          name:         base?.name    || step.agentId,
          icon:         base?.icon    || '🤖',
          model:        step.model    || base?.model    || 'claude-haiku-4-5',
          rank:         step.rank     || base?.rank     || '팀장',
          outputFile:   step.outputFile || base?.outputFile || 'output',
          inputContext: step.inputContext || [],
        };
      });

    /* 파이프라인 이름 복원 */
    const nameInput = document.getElementById('pipeline-name-input');
    if (nameInput) nameInput.value = custom.name || '';
  } else {
    /* 커스텀 없으면 에이전시 기본 에이전트 목록으로 초기화 */
    currentSteps = agentsPool.map(agent => ({
      agentId:      agent.id,
      name:         agent.name,
      icon:         agent.icon    || '🤖',
      model:        agent.model   || 'claude-haiku-4-5',
      rank:         agent.rank    || '팀장',
      outputFile:   agent.outputFile || agent.id,
      inputContext: [],
    }));
  }
};

/* ─── 스텝 목록 렌더링 ─── */
const renderStepList = () => {
  const container = document.getElementById('step-list');
  if (!container) return;

  if (currentSteps.length === 0) {
    container.innerHTML = `
      <div class="step-empty" role="status">
        아직 스텝이 없습니다. <strong>+ 에이전트 추가</strong> 버튼으로 시작하세요.
      </div>
    `;
    return;
  }

  container.innerHTML = currentSteps.map((step, idx) => buildStepHTML(step, idx)).join('');

  /* 드래그 앤 드롭 초기화 */
  initDragDrop();

  /* 각 스텝 이벤트 바인딩 */
  currentSteps.forEach((_, idx) => {
    /* 에이전트 셀렉터 변경 */
    document.getElementById(`step-agent-${idx}`)?.addEventListener('change', (e) => {
      const agentId = e.target.value;
      const agent = agentsPool.find(a => a.id === agentId);
      if (agent) {
        currentSteps[idx] = {
          ...currentSteps[idx],
          agentId:    agent.id,
          name:       agent.name,
          icon:       agent.icon || '🤖',
          model:      agent.model || currentSteps[idx].model,
          outputFile: agent.outputFile || agent.id,
        };
        renderStepList();
      }
    });

    /* 모델 셀렉터 변경 */
    document.getElementById(`step-model-${idx}`)?.addEventListener('change', (e) => {
      currentSteps[idx].model = e.target.value;
    });

    /* 직급 셀렉터 변경 */
    document.getElementById(`step-rank-${idx}`)?.addEventListener('change', (e) => {
      currentSteps[idx].rank = e.target.value;
    });

    /* 출력 키 입력 변경 */
    document.getElementById(`step-output-${idx}`)?.addEventListener('input', (e) => {
      const oldKey = currentSteps[idx].outputFile;
      const newKey = e.target.value.trim().replace(/\s+/g, '_');
      currentSteps[idx].outputFile = newKey;

      /* 이후 스텝들의 inputContext에서 구키 → 신키 교체 */
      for (let j = idx + 1; j < currentSteps.length; j++) {
        const ctxIdx = currentSteps[j].inputContext.indexOf(oldKey);
        if (ctxIdx !== -1) {
          currentSteps[j].inputContext[ctxIdx] = newKey;
        }
      }
    });

    /* 컨텍스트 체크박스 변경 */
    container.querySelectorAll(`.ctx-checkbox[data-step="${idx}"]`).forEach(cb => {
      cb.addEventListener('change', () => {
        /* 이전 스텝들의 outputFile 목록에서 체크된 것만 inputContext에 저장 */
        currentSteps[idx].inputContext = Array.from(
          container.querySelectorAll(`.ctx-checkbox[data-step="${idx}"]:checked`)
        ).map(el => el.value);
      });
    });

    /* 삭제 버튼 */
    document.getElementById(`step-remove-${idx}`)?.addEventListener('click', () => {
      removeStep(idx);
    });
  });
};

/* ─── 단일 스텝 카드 HTML 생성 ─── */
const buildStepHTML = (step, idx) => {
  /* 에이전트 셀렉터 옵션 */
  const agentOptions = agentsPool.map(a =>
    `<option value="${a.id}" ${a.id === step.agentId ? 'selected' : ''}>${a.icon || ''} ${a.name}</option>`
  ).join('');

  /* 모델 셀렉터 옵션 */
  const modelOptions = ALL_MODELS.map(m =>
    `<option value="${m.value}" ${m.value === step.model ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  /* 직급 셀렉터 옵션 */
  const rankOptions = RANK_LIST.map(r =>
    `<option value="${r.value}" ${r.value === step.rank ? 'selected' : ''}>${r.icon} ${r.value}</option>`
  ).join('');

  /* 컨텍스트 체크박스: 이전 스텝들의 outputFile 목록 */
  const prevOutputs = currentSteps.slice(0, idx).map(s => s.outputFile).filter(Boolean);
  const contextHTML = prevOutputs.length === 0
    ? '<span class="ctx-empty">(첫 번째 스텝 — 이전 출력 없음)</span>'
    : prevOutputs.map(key =>
        `<label class="ctx-checkbox-label">
           <input type="checkbox" class="ctx-checkbox" data-step="${idx}" value="${key}"
             ${(step.inputContext || []).includes(key) ? 'checked' : ''} />
           <code>${key}</code>
         </label>`
      ).join('');

  /* 스텝 간 화살표 (마지막 스텝 제외) */
  const arrowHTML = idx < currentSteps.length - 1
    ? '<div class="step-connector-arrow" aria-hidden="true">↓</div>'
    : '';

  return `
    <div class="step-item"
         draggable="true"
         data-idx="${idx}"
         role="listitem"
         aria-label="스텝 ${idx + 1}: ${step.name}">

      <!-- 드래그 핸들 + 스텝 번호 -->
      <div class="step-header">
        <span class="drag-handle" title="드래그하여 순서 변경" aria-hidden="true">≡</span>
        <span class="step-number">STEP ${idx + 1}</span>

        <!-- 에이전트 셀렉터 -->
        <select id="step-agent-${idx}" class="step-select step-agent-select"
                aria-label="에이전트 선택">
          ${agentOptions}
        </select>

        <!-- 모델 셀렉터 -->
        <select id="step-model-${idx}" class="step-select step-model-select"
                aria-label="모델 선택">
          ${modelOptions}
        </select>

        <!-- 직급 셀렉터 -->
        <select id="step-rank-${idx}" class="step-select step-rank-select"
                aria-label="직급 선택">
          ${rankOptions}
        </select>

        <!-- 삭제 버튼 -->
        <button id="step-remove-${idx}" class="step-remove-btn"
                aria-label="스텝 ${idx + 1} 삭제" title="삭제">× 삭제</button>
      </div>

      <!-- 출력 키 + 컨텍스트 -->
      <div class="step-body">
        <div class="step-field">
          <span class="step-field-label">출력 키</span>
          <input type="text" id="step-output-${idx}" class="step-output-input brand-input"
                 value="${step.outputFile || ''}"
                 placeholder="예) brand_strategy"
                 aria-label="출력 파일 키" />
        </div>
        <div class="step-field">
          <span class="step-field-label">컨텍스트</span>
          <div class="context-checkboxes">${contextHTML}</div>
        </div>
      </div>
    </div>
    ${arrowHTML}
  `;
};

/* ─── HTML5 Drag & Drop 초기화 ─── */
const initDragDrop = () => {
  const items = document.querySelectorAll('.step-item[draggable="true"]');

  items.forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcIdx = parseInt(item.dataset.idx, 10);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      document.querySelectorAll('.step-item').forEach(el => el.classList.remove('drag-over'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.step-item').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');

      const dropIdx = parseInt(item.dataset.idx, 10);
      if (dragSrcIdx === -1 || dragSrcIdx === dropIdx) return;

      /* 배열 재정렬 */
      const moved = currentSteps.splice(dragSrcIdx, 1)[0];
      currentSteps.splice(dropIdx, 0, moved);

      /* 재정렬 후 모든 스텝의 inputContext 유효성 재검사 */
      updateAllContextValidity();

      dragSrcIdx = -1;
      renderStepList();
    });
  });
};

/* ─── 스텝 순서 변경 후 inputContext 유효성 재검사 ─── */
const updateAllContextValidity = () => {
  currentSteps.forEach((step, idx) => {
    const availableKeys = new Set(
      currentSteps.slice(0, idx).map(s => s.outputFile).filter(Boolean)
    );
    /* 더 이상 이전 스텝이 아닌 키는 inputContext에서 제거 */
    step.inputContext = (step.inputContext || []).filter(k => availableKeys.has(k));
  });
};

/* ─── 스텝 추가 (에이전트 풀에서 선택) ─── */
const addStep = (agent) => {
  currentSteps.push({
    agentId:      agent.id,
    name:         agent.name,
    icon:         agent.icon || '🤖',
    model:        agent.model || 'claude-haiku-4-5',
    rank:         agent.rank || '팀장',
    outputFile:   `${agent.outputFile || agent.id}_${currentSteps.length + 1}`,
    inputContext: [],
  });
  closeModal();
  renderStepList();
};

/* ─── 스텝 삭제 ─── */
const removeStep = (idx) => {
  const removedKey = currentSteps[idx].outputFile;
  currentSteps.splice(idx, 1);

  /* 삭제된 스텝의 outputFile을 참조하던 이후 스텝들의 inputContext 정리 */
  currentSteps.forEach(step => {
    step.inputContext = (step.inputContext || []).filter(k => k !== removedKey);
  });

  renderStepList();
};

/* ─── 에이전트 풀 모달 ─── */
const openModal = () => {
  const modal = document.getElementById('add-agent-modal');
  const poolList = document.getElementById('agent-pool-list');
  if (!modal || !poolList) return;

  poolList.innerHTML = agentsPool.map(agent => `
    <button class="agent-pool-item" data-id="${agent.id}"
            aria-label="${agent.name} 추가">
      <span class="agent-pool-icon">${agent.icon || '🤖'}</span>
      <div class="agent-pool-info">
        <div class="agent-pool-name">${agent.name}</div>
        <div class="agent-pool-desc">${agent.desc || ''}</div>
      </div>
    </button>
  `).join('');

  poolList.querySelectorAll('.agent-pool-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const agent = agentsPool.find(a => a.id === btn.dataset.id);
      if (agent) addStep(agent);
    });
  });

  modal.style.display = 'flex';
  modal.focus?.();
};

const closeModal = () => {
  const modal = document.getElementById('add-agent-modal');
  if (modal) modal.style.display = 'none';
};

/* ─── 파이프라인 저장 ─── */
const savePipeline = () => {
  const name = (document.getElementById('pipeline-name-input')?.value || '').trim()
    || '커스텀 파이프라인';

  const steps = currentSteps.map((step, idx) => ({
    agentId:      step.agentId,
    order:        idx,
    model:        step.model,
    rank:         step.rank,
    outputFile:   step.outputFile,
    inputContext: step.inputContext || [],
  }));

  Store.set({
    customPipeline: {
      id:    `cp-${Date.now()}`,
      name,
      steps,
    },
  });

  showToast('✅ 커스텀 파이프라인이 저장되었습니다!');
};

/* ─── 파이프라인 초기화 ─── */
const resetPipeline = () => {
  if (!confirm('커스텀 파이프라인을 초기화하고 기본 파이프라인으로 복원할까요?')) return;

  Store.set({ customPipeline: null });
  currentSteps = agentsPool.map(agent => ({
    agentId:      agent.id,
    name:         agent.name,
    icon:         agent.icon || '🤖',
    model:        agent.model || 'claude-haiku-4-5',
    rank:         agent.rank || '팀장',
    outputFile:   agent.outputFile || agent.id,
    inputContext: [],
  }));

  const nameInput = document.getElementById('pipeline-name-input');
  if (nameInput) nameInput.value = '';

  renderStepList();
  showToast('🔄 기본 파이프라인으로 초기화되었습니다.');
};

/* ─── 토스트 알림 ─── */
const showToast = (msg) => {
  const existing = document.getElementById('editor-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'editor-toast';
  toast.className = 'editor-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  /* 3초 후 페이드아웃 제거 */
  setTimeout(() => toast.classList.add('fade-out'), 2500);
  setTimeout(() => toast.remove(), 3000);
};

/* ─── DOM 준비 시 초기화 ─── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadAgentsPool();
  await loadCurrentPipeline();
  renderStepList();

  /* 에이전트 추가 버튼 */
  document.getElementById('add-step-btn')?.addEventListener('click', openModal);

  /* 모달 닫기 */
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('add-agent-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  /* ESC 키로 모달 닫기 */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  /* 저장 버튼 */
  document.getElementById('save-btn')?.addEventListener('click', savePipeline);

  /* 초기화 버튼 */
  document.getElementById('reset-btn')?.addEventListener('click', resetPipeline);
});
