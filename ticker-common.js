// ticker-common.js  (type="module"로 로드)

// ===== 채널/스토리지 키 =====
const CHANNEL = 'sjui-ticker';
const LS_KEY  = 'SJ_TICKER_LAST';
const TS_KEY  = 'SJ_TICKER_TS';

// ===== 유틸 =====
const toArray = v => Array.isArray(v) ? v : (v ? [v] : []);

function macHex12(raw){
  const s = String(raw||'').toUpperCase().replace(/[^0-9A-F]/g,'');
  return /^[0-9A-F]{12}$/.test(s) ? s : null;
}
export function macPretty(raw){
  const h = macHex12(raw);
  return h ? h.match(/.{2}/g).join(':') : String(raw||'');
}

// ===== 텍스트 빌더 =====
/**
 * devicesMap: Map(id -> { error_code, ts, ... })
 * ids: string[]
 * activeMs: number
 * labeler: (id) => label text (기본: AA:BB:.. 포맷)
 * return: string[]
 */
export function buildTickerTextsFromDevices({
  devicesMap,
  ids,
  activeMs = 60_000,
  labeler = (id) => macPretty(id),
} = {}) {
  if (!devicesMap || !ids) return [];
  const now = Date.now();

  // 가장 높은 심각도 우선(에러>경고), 라벨 중복 제거
  const byLabel = new Map(); // label -> 'error' | 'warn'
  for (const raw of ids) {
    const id = macHex12(raw);
    if (!id) continue;
    const d = devicesMap.get(id) || {};
    const age = Number.isFinite(d.ts) ? (now - d.ts) : Infinity;
    if (age > activeMs) continue;

    const code = Number(d.error_code);
    if (code !== 1 && code !== 2) continue;

    const label = labeler(id);
    const level = (code === 2 ? 'error' : 'warn');
    const prev = byLabel.get(label);
    if (!prev || (prev === 'warn' && level === 'error')) byLabel.set(label, level);
  }

  return Array.from(byLabel, ([label, level]) =>
    level === 'error'
      ? `${label} 디바이스가 에러 상태입니다.`
      : `${label} 디바이스가 경고 상태입니다.`
  );
}

// ===== 내부 허브 적용(객체모드로만) =====
function applyToLocalTickerObjects(one){
  // one: { text, level? }
  if (!one || !one.text) return;
  if (window.SJUI?.TickerHub?.setAlerts) {
    window.SJUI.TickerHub.setAlerts([one.text]); // Rotator엔 문자열 배열
  } else {
    window.dispatchEvent(new CustomEvent('sjui:alert-set', { detail: { alerts:[one] } }));
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([one]));
    localStorage.setItem(TS_KEY, String(Date.now()));
  } catch {}
}

// ===== 정규화 & 인접중복 제거 =====
function collapseAdjacentDuplicates(list){
  const out = []; let prev = null;
  for (const x of list){
    if (!prev || x.text !== prev.text) out.push(x);
    prev = x;
  }
  return out;
}
function normalizeAlerts(input, currentText){
  const arr = toArray(input).map(x => {
    if (typeof x === 'string') return { text: x, level: 'info' };
    if (x && typeof x.text === 'string') return { text: x.text, level: x.level || 'info' };
    return { text: String(x ?? ''), level: 'info' };
  }).filter(a => a.text && String(a.text).trim());

  const step1 = collapseAdjacentDuplicates(arr);
  if (step1.length && step1[0].text === currentText) step1.shift();
  return step1;
}

// ===== 스태거 큐 =====
let queue = [];           // 대기열(객체)
let running = false;
let timer  = null;

// 페이드/재표시 제어(겹침 방지)
const FADE_MS_DEFAULT = 700;   // ui-common.css의 .35s*입출  근사치
let REPEAT_COOLDOWN_MS = 2800; // 같은 문구 재표시 쿨다운
let STAGGER_MS_DEFAULT = 1200; // 건당 간격

let currentText = '';
let currentShownAt = 0;
let transitionLockUntil = 0;

function seenRecently(text, now = Date.now()){
  return (text === currentText) && ((now - currentShownAt) < Math.max(REPEAT_COOLDOWN_MS, FADE_MS_DEFAULT*2));
}

function runStaggerLoop(staggerMs){
  if (running) return;
  running = true;

  const tick = () => {
    const now = Date.now();
    if (now < transitionLockUntil) {
      timer = setTimeout(tick, transitionLockUntil - now + 10);
      return;
    }
    const next = queue.shift();
    if (!next){
      running = false;
      timer = null;
      return;
    }

    if (seenRecently(next.text, now)) {
      // 쿨다운이 남았으면 뒤로 보내 재시도
      queue.push(next);
      const wait = Math.max(REPEAT_COOLDOWN_MS - (now - currentShownAt), 300);
      timer = setTimeout(tick, wait);
      return;
    }

    // 실제 표시(1건만)
    applyToLocalTickerObjects(next);
    currentText = next.text;
    currentShownAt = Date.now();
    transitionLockUntil = currentShownAt + (window.SJUI?.TickerHub?.FADE_MS || FADE_MS_DEFAULT);

    const delay = Math.max(300, staggerMs || STAGGER_MS_DEFAULT);
    timer = setTimeout(tick, delay);
  };

  tick();
}

/**
 * 여러 페이지에서 동일하게 호출하는 퍼블리셔
 * @param alerts string | {text,level} | 배열
 * @param options.mode 'replace' | 'append'
 * @param options.staggerMs number
 * @param options.broadcast boolean
 */
export function publishAlerts(alerts, { mode='replace', staggerMs=STAGGER_MS_DEFAULT, broadcast=true } = {}){
  const rawInput = toArray(alerts);                 // ← 원래 호출 입력
  const list = normalizeAlerts(alerts, currentText);

  // ⚠️ normalize 이후 '비어버린' 경우:
  // - 호출이 진짜 []면 → 비우기
  // - 같은 문구라서 비게 된 경우 → 유지(아무 것도 안 함)
  if (!list.length) {
    const requestedClear = rawInput.length === 0;    // 진짜로 []를 보냈는지
    if (mode === 'replace' && requestedClear) {
      queue = [];
      running = false;
      if (timer) { clearTimeout(timer); timer = null; }

      // 화면 비우기
      try {
        if (window.SJUI?.TickerHub?.setAlerts) {
          window.SJUI.TickerHub.setAlerts([]);   // 로테이터 비우기
        } else {
          window.dispatchEvent(new CustomEvent('sjui:alert-set', { detail: { alerts: [] } }));
        }
        localStorage.setItem(LS_KEY, '[]');      // 마지막 1건도 비움
        localStorage.setItem(TS_KEY, String(Date.now()));
      } catch {}

      // 다른 탭에도 '비우기' 통지
      if (broadcast) {
        try {
          if ('BroadcastChannel' in self) {
            const bc = new BroadcastChannel(CHANNEL);
            bc.postMessage({ type:'push', payload:[], mode, staggerMs }); // 빈 payload 전송
            bc.close?.();
          } else {
            localStorage.setItem(TS_KEY, String(Date.now())); // storage 폴백 신호
          }
        } catch {}
      }

      // 현재 문구 상태도 리셋
      currentText = '';
      currentShownAt = 0;
      transitionLockUntil = 0;
    }
    return; // ← 여기서 종료
  }

  if (mode === 'replace') queue = [];
  if (queue.length && list.length && queue[queue.length-1].text === list[0].text) list.shift();
  if (list.length) queue.push(...list);

  runStaggerLoop(staggerMs);

  if (broadcast) {
    try{
      if ('BroadcastChannel' in self) {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage({ type:'push', payload:list, mode, staggerMs });
        bc.close?.();
      } else {
        localStorage.setItem(TS_KEY, String(Date.now()));
      }
    }catch{}
  }
}

// ===== 구독(모든 페이지에서 1회) =====
export function subscribeTickerFromOthers(){
  try{
    if ('BroadcastChannel' in self) {
      const bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e)=>{
        const { type, payload, mode, staggerMs } = e?.data || {};
        if (type === 'push') {
          // ✅ 비우기 케이스
          if (Array.isArray(payload) && payload.length === 0 && mode === 'replace') {
            queue = [];
            running = false;
            if (timer) { clearTimeout(timer); timer = null; }
            try {
              if (window.SJUI?.TickerHub?.setAlerts) {
                window.SJUI.TickerHub.setAlerts([]);
              } else {
                window.dispatchEvent(new CustomEvent('sjui:alert-set', { detail: { alerts: [] } }));
              }
            } catch {}
            currentText = '';
            currentShownAt = 0;
            transitionLockUntil = 0;
            return;
          }

          const list = normalizeAlerts(payload, currentText);
          if (!list.length) return;
          if (mode === 'replace') queue = [];
          queue.push(...list);
          runStaggerLoop(staggerMs);
        }
      };
    }
  }catch{}

  // storage 폴백: 마지막 1건만 즉시 반영
  window.addEventListener('storage', (e)=>{
    if (e.key !== LS_KEY && e.key !== TS_KEY) return;
    try{
      const raw = localStorage.getItem(LS_KEY) || '[]';
      const last = JSON.parse(raw);
      const one = last?.[0];

      // ✅ 저장소가 빈 배열이면 화면 비우기
      if (!one) {
        try {
          if (window.SJUI?.TickerHub?.setAlerts) {
            window.SJUI.TickerHub.setAlerts([]);
          } else {
            window.dispatchEvent(new CustomEvent('sjui:alert-set', { detail: { alerts: [] } }));
          }
        } catch {}
        currentText = '';
        currentShownAt = 0;
        transitionLockUntil = 0;
        return;
      }

      if (seenRecently(one.text)) return;
      applyToLocalTickerObjects(one);
      currentText = one.text;
      currentShownAt = Date.now();
      transitionLockUntil = currentShownAt + FADE_MS_DEFAULT;
    }catch{}
  });

  // 첫 진입: 이전 값 반영(있으면만)
  try{
    const last = JSON.parse(localStorage.getItem(LS_KEY)||'[]');
    const one = last?.[0];
    if (one?.text) {
      applyToLocalTickerObjects(one);
      currentText = one.text;
      currentShownAt = Date.now();
      transitionLockUntil = currentShownAt + FADE_MS_DEFAULT;
    } else {
      // ✅ 이전 값이 없어도 로테이터 초기화(선택)
      try { window.SJUI?.TickerHub?.setAlerts?.([]); } catch {}
    }
  }catch{}

  (function waitSJUI(){
    if (!window.SJUI?.mountRotators) return setTimeout(waitSJUI, 30);
    try { window.SJUI.mountRotators(); } catch {}
  })();
}
