/* ========================================
   History JS — 히스토리 페이지 로직
   실행 카드 목록 + 클릭 시 상세 펼침
   데이터 소스: Store.generatedRuns (localStorage)
   ======================================== */

'use strict';

let historyData = [];

/* ─── 초기화 ─── */
const init = () => {
  const state = Store.get();
  historyData = state.generatedRuns || [];

  if (!historyData.length) {
    renderEmpty();
  } else {
    renderHistoryList();
  }
};

/* ─── 히스토리 목록 렌더링 ─── */
const renderHistoryList = () => {
  const container = document.getElementById('history-list');
  if (!container) return;

  const cardsHTML = historyData.map(run => buildHistoryCard(run)).join('');
  container.innerHTML = cardsHTML;

  /* 카드 클릭 → 상세 토글 */
  container.querySelectorAll('.history-card').forEach(card => {
    const header = card.querySelector('.history-card-header');
    header.addEventListener('click', () => toggleDetail(card));
  });

  /* 아웃풋 링크 */
  container.querySelectorAll('.view-output-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `./output.html?run=${btn.dataset.runId}`;
    });
  });

  /* 총 건수 업데이트 */
  const totalEl = document.getElementById('total-runs');
  if (totalEl) totalEl.textContent = historyData.length;
};

/** 히스토리 카드 HTML 빌드 */
const buildHistoryCard = (run) => {
  const createdAt = formatDate(run.createdAt);
  const progressPct = Math.round((run.completedSteps / run.totalSteps) * 100);
  const statusBadge = run.status === 'completed'
    ? '<span class="history-status-badge badge-completed">완료</span>'
    : '<span class="history-status-badge badge-running">실행 중</span>';

  /* agentsSnapshot 우선, 없으면 빈 배열 폴백 */
  const agentsSnapshot = run.agentsSnapshot || [];

  /* 에이전트별 결과 행 */
  const resultRowsHTML = (run.results || []).map(result => {
    const agent = agentsSnapshot.find(a => a.id === result.agentId);
    if (!agent) return '';

    const durationText = result.duration ? `${result.duration}s` : '—';
    const tokensText   = result.tokens   ? result.tokens.toLocaleString() : '—';
    const statusIcon   = result.status === 'done' ? '✓' : result.status === 'running' ? '…' : '–';
    const iconColor    = result.status === 'done'
      ? `background:var(${agent.glowVar})`
      : 'background:var(--surface)';

    return `
      <div class="result-row">
        <div class="result-row-icon" style="${iconColor}">${agent.icon}</div>
        <div class="result-row-info">
          <div class="result-row-name" style="color:var(${agent.accentVar})">${agent.name} <span style="color:var(--text-dim);font-weight:400">${agent.rank}</span></div>
          <div class="result-row-file">→ 📄 ${agent.outputFile}</div>
        </div>
        <div class="result-row-stats">
          <div class="result-row-stat">
            <div class="result-row-stat-value">${durationText}</div>
            <div class="result-row-stat-label">소요시간</div>
          </div>
          <div class="result-row-stat">
            <div class="result-row-stat-value">${tokensText}</div>
            <div class="result-row-stat-label">토큰</div>
          </div>
          <div style="font-size:12px;font-weight:700;color:${result.status === 'done' ? 'var(--accent-dev)' : 'var(--text-dim)'}">
            ${statusIcon}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="history-card" data-run-id="${run.id}">
      <div class="history-card-header" role="button" tabindex="0" aria-label="${run.label} 상세 보기">
        <div class="history-run-icon">⚡</div>
        <div class="history-run-info">
          <div class="history-run-label">
            ${run.label}
            ${statusBadge}
          </div>
          <div class="history-run-meta">
            <span>${createdAt}</span>
            <span>${run.completedSteps}/${run.totalSteps} 단계 완료</span>
            <span>총 ${(run.totalTokens || 0).toLocaleString()} 토큰</span>
          </div>
        </div>
        <div class="history-run-stats">
          <div class="stat-value">${(run.totalTokens || 0).toLocaleString()}</div>
          <div class="stat-label">총 토큰</div>
        </div>
      </div>
      <div class="history-progress-bar">
        <div class="history-progress-fill" style="width:${progressPct}%"></div>
      </div>
      <div class="history-card-detail">
        ${resultRowsHTML}
        <div class="detail-actions">
          <button class="btn btn-ghost btn-sm view-output-btn" data-run-id="${run.id}"
                  aria-label="${run.label} 아웃풋 보기">
            📄 아웃풋 보기
          </button>
        </div>
      </div>
    </div>
  `;
};

/** 상세 패널 토글 */
const toggleDetail = (card) => {
  const isExpanded = card.classList.contains('expanded');

  /* 다른 카드 모두 닫기 */
  document.querySelectorAll('.history-card.expanded').forEach(c => {
    if (c !== card) c.classList.remove('expanded');
  });

  card.classList.toggle('expanded', !isExpanded);
};

/** 빈 상태 표시 */
const renderEmpty = () => {
  const container = document.getElementById('history-list');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-history">
      <div class="empty-history-icon">📭</div>
      <div class="empty-history-text">
        아직 실행 기록이 없습니다.<br>
        파이프라인 페이지에서 실행을 시작해보세요.
      </div>
    </div>
  `;
};

/** 날짜 포맷 (ISO → 한국어 표기) */
const formatDate = (isoString) => {
  const d = new Date(isoString);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ─── DOM 준비 후 초기화 ─── */
document.addEventListener('DOMContentLoaded', init);
