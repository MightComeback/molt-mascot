const pill = document.getElementById('pill');
const setup = document.getElementById('setup');
const urlInput = document.getElementById('url');
const tokenInput = document.getElementById('token');
const saveBtn = document.getElementById('save');

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const STORAGE_KEY = 'mig15:gateway';

function loadCfg() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || null;
  } catch {
    return null;
  }
}

function saveCfg(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function showSetup(prefill) {
  setup.hidden = false;
  urlInput.value = prefill?.url || 'ws://127.0.0.1:18789';
  tokenInput.value = prefill?.token || '';
}

// --- Pixel "lobster" placeholders (swap for real sprites later) ---
function drawLobster(mode, t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // background glow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(48, 56, 30, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  const bob = Math.sin(t / 250) * 1.5;
  ctx.fillStyle = mode === 'error' ? '#ff3b30' : (mode === 'tool' ? '#34c759' : (mode === 'thinking' ? '#0a84ff' : '#ff9f0a'));
  ctx.fillRect(34, 28 + bob, 28, 30);

  // eyes
  ctx.fillStyle = 'white';
  ctx.fillRect(40, 34 + bob, 4, 4);
  ctx.fillRect(52, 34 + bob, 4, 4);
  ctx.fillStyle = 'black';
  ctx.fillRect(41, 35 + bob, 2, 2);
  ctx.fillRect(53, 35 + bob, 2, 2);

  // claws
  const claw = Math.sin(t / 120) * (mode === 'thinking' ? 2 : 1);
  ctx.fillStyle = ctx.fillStyle;
  ctx.fillRect(24 + claw, 38 + bob, 10, 8);
  ctx.fillRect(62 - claw, 38 + bob, 10, 8);

  // label
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '10px ui-sans-serif, system-ui';
  ctx.fillText(mode.toUpperCase(), 30, 80);
}

// --- State machine ---
const Mode = {
  idle: 'idle',
  thinking: 'thinking',
  tool: 'tool',
  error: 'error',
};

let currentMode = Mode.idle;
let modeSince = Date.now();
let idleTimer = null;

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  modeSince = Date.now();
  if (idleTimer) clearTimeout(idleTimer);

  pill.textContent = mode;
}

function scheduleIdle(delayMs = 800) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => setMode(Mode.idle), delayMs);
}

// --- Gateway WS ---
let ws = null;
let reqId = 0;

function nextId(prefix) {
  reqId += 1;
  return `${prefix}${reqId}`;
}

function connect(cfg) {
  setup.hidden = true;
  pill.textContent = 'connecting…';

  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }

  ws = new WebSocket(cfg.url);

  ws.addEventListener('open', () => {
    const id = nextId('c');
    const connectFrame = {
      type: 'req',
      id,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'gateway-client',
          displayName: 'MIG-15 Mascot',
          version: '0.0.1',
          platform: navigator.userAgent,
          mode: 'ui',
          instanceId: `mig15-${Math.random().toString(16).slice(2)}`,
        },
        auth: cfg.token ? { token: cfg.token } : undefined,
      },
    };
    ws.send(JSON.stringify(connectFrame));
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    // Always print raw frames for MVP (dev ergonomics).
    // eslint-disable-next-line no-console
    console.log('gateway:', msg);

    if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
      pill.textContent = 'connected';
      setMode(Mode.idle);
      // Optional: fetch plugin simplified state once.
      const id = nextId('s');
      ws.send(JSON.stringify({ type: 'req', id, method: 'mig15.state', params: {} }));
      return;
    }

    // Plugin state response
    if (msg.type === 'res' && msg.ok && msg.payload?.ok && msg.payload?.state?.mode) {
      setMode(msg.payload.state.mode);
      return;
    }

    // Native agent stream mapping (no plugin required).
    if (msg.type === 'event' && msg.event === 'agent') {
      const p = msg.payload;
      const stream = p?.stream;
      if (stream === 'lifecycle') {
        if (p?.phase === 'start') setMode(Mode.thinking);
        if (p?.phase === 'end') scheduleIdle(800);
        if (p?.phase === 'error') {
          setMode(Mode.error);
          setTimeout(() => scheduleIdle(800), 5000);
        }
      }
      if (stream === 'tool') {
        // Heuristic: any tool activity => tool
        setMode(Mode.tool);
        // bounce back to thinking unless lifecycle ends
        setTimeout(() => {
          if (currentMode === Mode.tool) setMode(Mode.thinking);
        }, 250);
      }
    }
  });

  ws.addEventListener('close', () => {
    pill.textContent = 'disconnected';
    setMode(Mode.idle);
    setTimeout(() => {
      const fresh = loadCfg();
      if (fresh) connect(fresh);
      else showSetup({ url: cfg.url, token: cfg.token });
    }, 1500);
  });

  ws.addEventListener('error', () => {
    pill.textContent = 'ws error';
    setMode(Mode.error);
  });
}

saveBtn.addEventListener('click', () => {
  const cfg = { url: urlInput.value.trim(), token: tokenInput.value.trim() };
  saveCfg(cfg);
  connect(cfg);
});

// boot
const cfg = loadCfg();
if (!cfg?.url) {
  showSetup(cfg);
} else {
  connect(cfg);
}

function frame(t) {
  drawLobster(currentMode, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
