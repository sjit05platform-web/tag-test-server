// ===== Alarm Capture (공통 저장소) =====
(() => {
  // ★ 설정
  const WS_URL = "wss://fskxd58gc3.execute-api.ap-northeast-2.amazonaws.com/dev";
  const PENDING_KEY = "pending_alarms_v1";   // 미확인 알람 저장
  const ACK_KEY     = "ack_alarms_v1";       // 확인(삭제)된 알람 키 저장
  const TTL_MS      = 24*60*60*1000;         // 24시간 보관
  const BC_NAME     = "alarm-store";         // BroadcastChannel
  const bc = ("BroadcastChannel" in window) ? new BroadcastChannel(BC_NAME) : null;

  // ★ 중복 방지 버킷 (예: 60000=1분, 10000=10초, 0=중복 방지 끔)
  const BUCKET_MS   = 10000;

  // ★ 유틸
  const toNum = v => (v==null ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const safeJSON = s => { try{return JSON.parse(s)}catch{return null} };

  // 상태 정규화(숫자/문자 모두 허용)
  function normWarnErrByNumberLike(v){
    const n = Number(v);
    if (Number.isFinite(n)) {
      if (n >= 2) return "에러";
      if (n >= 1) return "경고";
      return null;
    }
    return null;
  }
  const normByString = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return null;
    if (["2","2.0","error","err","에러","down","offline"].includes(s)) return "에러";
    if (["1","1.0","warn","warning","경고"].includes(s)) return "경고";
    return null;
  };

  const normTagStatus = (code) => normByString(code) ?? normWarnErrByNumberLike(code);
  const normGwStatus  = (v)    => normByString(v)    ?? normWarnErrByNumberLike(v);

  function makeKey(kind,id,status,ts){
    const bucket = BUCKET_MS > 0 ? Math.floor(ts / BUCKET_MS) : ts;
    return `${kind}:${id}:${status}:${bucket}`;
  }

  // ★ 로컬 상태 로딩/저장
  const loadAcked  = () => new Set(safeJSON(localStorage.getItem(ACK_KEY)) || []);
  const saveAcked  = (set) => localStorage.setItem(ACK_KEY, JSON.stringify([...set]));

  function loadPending() {
    const now = Date.now();
    const acked = loadAcked();
    const arr = safeJSON(localStorage.getItem(PENDING_KEY)) || [];
    const map = new Map();
    for (const a of arr) {
      if (!a || !a.key || !a.id || !a.kind || !a.status || !a.ts) continue;
      if (acked.has(a.key)) continue;                 // 확인된 건 제외
      if (now - Number(a.ts) > TTL_MS) continue;      // TTL 초과 제외
      map.set(a.key, {
        key: String(a.key),
        id: String(a.id),
        kind: a.kind === 'gateway' ? 'gateway' : 'device',
        status: String(a.status),
        ts: Number(a.ts),
        // ▼ 추가 필드들 (확장 가능)
        send_type: a.send_type ?? null
      });
    }
    return map;
  }

  function savePending(map) {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...map.values()]));
  }

  // ★ 저장소 API (전역)
  const AlarmStore = {
    getAll() {
      return [...loadPending().values()];
    },
    getCount() {
      return loadPending().size;
    },
    ack(keys) { // keys: string[]
      const acked = loadAcked();
      const pending = loadPending();
      for (const k of keys) {
        if (pending.has(k)) pending.delete(k);
        acked.add(k);
      }
      savePending(pending);
      saveAcked(acked);
      bc && bc.postMessage({type:'ack', keys});
      // storage 이벤트도 발생(같은 탭 처리용)
      localStorage.setItem(PENDING_KEY, localStorage.getItem(PENDING_KEY));
    },
    /**
     * add - 알람 추가
     * @param {'device'|'gateway'} kind
     * @param {string} id
     * @param {'경고'|'에러'} status
     * @param {number} ts (ms 또는 s, 자동 보정)
     * @param {object} extra (예: {send_type})
     */
    add(kind, id, status, ts, extra={}) {
      if (!id || !status || !ts) return;
      if (ts < 1e12) ts *= 1000; // sec -> ms
      const key = makeKey(kind,id,status,ts);

      const acked = loadAcked();
      if (acked.has(key)) return;

      const pending = loadPending();
      if (pending.has(key)) return; // 같은 버킷(분/초) 내 중복 방지

      const item = {
        key,
        id: String(id),
        kind: kind === 'gateway' ? 'gateway' : 'device',
        status,
        ts: Number(ts),
        // ▼ 추가 필드 저장
        send_type: extra.send_type ?? null
      };
      pending.set(key, item);
      savePending(pending);
      bc && bc.postMessage({type:'add', alarm: item});
      // storage 이벤트도 발생(같은 탭 처리용)
      localStorage.setItem(PENDING_KEY, localStorage.getItem(PENDING_KEY));
    },
    subscribe(fn) {
      // 다른 탭/창에서 변경 반영
      if (bc) bc.onmessage = (ev)=> fn && fn(ev.data);
      // 동일 탭 내 다른 스크립트 업데이트 반영
      window.addEventListener('storage', (e)=>{
        if (e.key===PENDING_KEY || e.key===ACK_KEY) fn && fn({type:'storage'});
      });
    }
  };
  window.AlarmStore = AlarmStore;

  // ★ WS 캡처 (모든 페이지에서 동일하게 작동)
  let ws, retry=0;
  function handleMessage(raw) {
    try{
      const msg = JSON.parse(raw);
      const now = Date.now();

      // 태그(디바이스)
      const tagId = msg.tag_address || msg.device_id || msg.id;
      if (tagId != null) {
        const status = normTagStatus(msg.error_code);
        if (status) {
          let t = toNum(msg.timestamp ?? msg.time ?? msg.ts ?? msg.timestamp_epoch ?? msg.raw_time) ?? now;
          // send_type 포함해서 저장
          AlarmStore.add('device', String(tagId), status, t, { send_type: msg.send_type });
        }
      }

      // 게이트웨이
      const gwId = msg.gw_address;
      if (gwId) {
        const status = normGwStatus(msg.gw_statue);
        if (status) {
          let t = toNum(msg.timestamp ?? msg.time ?? msg.ts ?? msg.timestamp_epoch ?? msg.raw_time) ?? now;
          AlarmStore.add('gateway', String(gwId), status, t, { send_type: msg.send_type });
        }
      }
    }catch(e){ /* skip */ }
  }
  function connectWS(){
    try{
      ws = new WebSocket(WS_URL);
      ws.onopen = ()=>{ retry=0; };
      ws.onmessage = (ev)=> handleMessage(ev.data);
      ws.onclose = ()=> setTimeout(connectWS, Math.min(1000*(++retry), 10000));
      ws.onerror = ()=> ws && ws.close();
    }catch(e){ setTimeout(connectWS, 2000); }
  }
  connectWS();
})();
