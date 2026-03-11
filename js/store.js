/* ========================================
   Store — localStorage 상태 관리 모듈
   IIFE 패턴으로 전역 오염 방지
   ======================================== */

const Store = (() => {
  const KEY = 'mas_state';

  const DEFAULT = {
    tokenBalance: 100,   // Free 플랜: 100 크레딧 (파이프라인 약 6~7회 실행)
    tokenMax: 100,       // 플랜 한도
    currentRunId: 'run-001',
    selectedOutputId: null,
    agentOverrides: {},    // { [agentId]: { model, tokenMultiplier } }
    promptOverrides: {},   // { [agentId]: string }
    pipelineStatus: 'idle', // 'idle' | 'running' | 'completed'
    activeRunStep: null,   // 현재 실행 중인 에이전트 id
    selectedAgency: 'agents.json', // 선택된 에이전시 유형 파일명
    apiKey: '',            // Anthropic API 키 (실제 AI 생성에 사용)
    userInput: '',         // {{user_input}} 변수에 주입되는 프로젝트 요청
    generatedRuns: [],     // 실제 생성된 실행 기록 (localStorage 영속)
    generatedOutputs: [],  // 실제 생성된 아웃풋 파일 (localStorage 영속)
    customPipeline: null,  // 커스텀 파이프라인 { id, name, steps: [{agentId, order, inputContext[], outputFile}] } | null
    brandInfo: {           // {{brand_info}} 변수에 주입되는 클라이언트 브랜드 가이드라인
      brandName: '',
      slogan: '',
      brandColors: '',
      toneAndManner: '',
      targetAudience: '',
      competitors: '',
    },
  };

  /** 저장된 상태 읽기 (없으면 DEFAULT 반환) */
  const get = () => {
    try {
      const stored = localStorage.getItem(KEY);
      return stored ? { ...DEFAULT, ...JSON.parse(stored) } : { ...DEFAULT };
    } catch {
      return { ...DEFAULT };
    }
  };

  /** 부분 업데이트 (기존 상태와 병합) */
  const set = (partial) => {
    const current = get();
    const next = { ...current, ...partial };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      console.warn('Store 저장 실패:', e);
    }
    return next;
  };

  /** DEFAULT 값으로 초기화 */
  const reset = () => {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      console.warn('Store 초기화 실패:', e);
    }
    return { ...DEFAULT };
  };

  /** 특정 에이전트 오버라이드 저장 */
  const setAgentOverride = (agentId, data) => {
    const state = get();
    return set({
      agentOverrides: { ...state.agentOverrides, [agentId]: { ...state.agentOverrides[agentId], ...data } },
    });
  };

  /** 특정 에이전트 프롬프트 오버라이드 저장 */
  const setPromptOverride = (agentId, prompt) => {
    const state = get();
    return set({
      promptOverrides: { ...state.promptOverrides, [agentId]: prompt },
    });
  };

  return { get, set, reset, setAgentOverride, setPromptOverride };
})();
