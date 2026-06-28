/**
 * background.js — MapHarvest v5.0
 *
 * All previous fixes retained +
 *  NEW-FIX-1: RESUME_EXTRACTION এ content script re-inject করে তারপর START_EXTRACTION পাঠায়
 *             (popup এর resume banner inject করে কিন্তু background side করে না — mismatch)
 *  NEW-FIX-2: START_EXTRACTION এ আগের state properly clean করা হয়নি — seenUrls Set reset missing
 *  NEW-FIX-3: EXTRACTION_DONE এ flushFailedRows শেষ না হলেও DONE broadcast হত (race) — await properly
 *  NEW-FIX-4: persistState() এ mainTabId save হচ্ছিল না — restore করলে mainTabId হারিয়ে যেত
 *  NEW-FIX-5: Network online handler এ state.status check ছিল 'running' — but paused থাকে, তাই 'paused' check করা উচিত
 */

// ─── Keep-alive ───────────────────────────────────────────────────────────────
function startKeepAlive() {
  if (!chrome.alarms) return;
  chrome.alarms.clear('keepAlive', () => {
    chrome.alarms.create('keepAlive', { periodInMinutes: 1/3 });
  });
}
function stopKeepAlive() {
  if (chrome.alarms) chrome.alarms.clear('keepAlive');
}

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  status: 'idle',
  keyword: '',
  limit: 0,
  sheetUrl: '',
  queue: [],
  seenUrls: new Set(),
  scraped: 0,
  saved: 0,
  errors: 0,
  mainTabId: null,
};

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'keepAlive' && state.status === 'running') {
      // heartbeat — keeps service worker alive
    }
  });
}

// ─── Network auto-pause / auto-resume ────────────────────────────────────────
let _wasRunningBeforeOffline = false;

self.addEventListener('offline', () => {
  if (state.status === 'running') {
    _wasRunningBeforeOffline = true;
    state.status = 'paused';
    persistState();
    broadcast({ type: 'NETWORK_OFFLINE' });
    broadcast({ type: 'LOG', message: '🔴 Network disconnected — extraction paused automatically.', level: 'warn' });
  }
});

self.addEventListener('online', () => {
  broadcast({ type: 'NETWORK_ONLINE' });
  // NEW-FIX-5: check 'paused' not 'running' — network offline sets status to 'paused'
  if (_wasRunningBeforeOffline && state.status === 'paused') {
    _wasRunningBeforeOffline = false;
    broadcast({ type: 'LOG', message: '🟢 Network back — resuming in 3 seconds…', level: 'ok' });
    setTimeout(() => {
      restoreStateFromStorage(() => {
        state.status = 'running';
        persistState();
        broadcast({ type: 'AUTO_RESUMED' });
        broadcast({ type: 'LOG', message: `▶️ Auto-resumed — ${state.queue.length} listings remaining`, level: 'ok' });
      });
    }, 3000);
  }
});

// ─── Persist & restore ───────────────────────────────────────────────────────
function persistState() {
  chrome.storage.local.set({
    extractorState: {
      status:    state.status,
      keyword:   state.keyword,
      limit:     state.limit,
      sheetUrl:  state.sheetUrl,
      queue:     state.queue,
      seenUrls:  [...state.seenUrls],
      scraped:   state.scraped,
      saved:     state.saved,
      errors:    state.errors,
      mainTabId: state.mainTabId, // NEW-FIX-4: persist mainTabId too
    }
  });
}

function restoreStateFromStorage(cb) {
  chrome.storage.local.get(['extractorState'], r => {
    const s = r.extractorState || {};
    if (Array.isArray(s.queue) && s.queue.length > 0 && state.queue.length === 0) {
      state.queue     = s.queue;
      state.seenUrls  = new Set(s.seenUrls || []);
      state.keyword   = s.keyword   || state.keyword;
      state.limit     = s.limit     ?? state.limit;
      state.sheetUrl  = s.sheetUrl  || state.sheetUrl;
      state.scraped   = s.scraped   || 0;
      state.saved     = s.saved     || 0;
      state.errors    = s.errors    || 0;
      state.mainTabId = s.mainTabId || state.mainTabId; // NEW-FIX-4: restore mainTabId
    }
    if (cb) cb();
  });
}

// ─── Failed rows retry queue ─────────────────────────────────────────────────
async function flushFailedRows() {
  return new Promise(resolve => {
    chrome.storage.local.get(['failedRows'], async r => {
      const failed = r.failedRows || [];
      if (!failed.length) { resolve(); return; }

      const stillFailed = [];
      for (const row of failed) {
        const { _sheetUrl, ...cleanRecord } = row;
        const url = state.sheetUrl || _sheetUrl;
        if (!url) { stillFailed.push(row); continue; }
        const ok = await sendToSheet(url, cleanRecord);
        if (!ok) stillFailed.push(row);
      }
      chrome.storage.local.set({ failedRows: stillFailed });
      const retried = failed.length - stillFailed.length;
      if (retried > 0) {
        broadcast({ type: 'LOG', message: `♻️ Retried ${retried} previously failed rows`, level: 'ok' });
      }
      resolve();
    });
  });
}

async function queueFailedRow(sheetUrl, record) {
  return new Promise(resolve => {
    chrome.storage.local.get(['failedRows'], r => {
      const failed = r.failedRows || [];
      failed.push({ ...record, _sheetUrl: sheetUrl });
      chrome.storage.local.set({ failedRows: failed }, resolve);
    });
  });
}

// ─── Sheet communication ──────────────────────────────────────────────────────
async function sendToSheet(url, record) {
  try {
    if (!url) return false;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok' || data.status === 'skip';
  } catch(e) {
    return false;
  }
}

// ─── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {

    case 'RELAY':
      broadcast(msg.payload);
      break;

    case 'GET_STATE':
      sendResponse({ ...state, seenUrls: [...state.seenUrls] });
      return true;

    case 'START_EXTRACTION':
      startExtraction(msg.config);
      sendResponse({ ok: true });
      break;

    case 'STOP_EXTRACTION':
      state.status  = 'idle';
      state.queue   = [];
      state.scraped = 0;
      state.saved   = 0;
      state.errors  = 0;
      // NEW-FIX-2: properly reset seenUrls on stop
      state.seenUrls = new Set();
      persistState();
      stopKeepAlive();
      broadcast({ type: 'STOPPED' });
      break;

    case 'PAUSE_EXTRACTION':
      state.status = 'paused';
      persistState();
      broadcast({ type: 'PAUSED' });
      break;

    case 'RESUME_EXTRACTION':
      restoreStateFromStorage(() => {
        state.status = 'running';
        persistState();
        // NEW-FIX-1: re-inject content script into Maps tab before resuming
        if (state.mainTabId) {
          chrome.tabs.executeScript(state.mainTabId, { file: 'src/content.js' }, () => {
            if (chrome.runtime.lastError) {
              broadcast({ type: 'LOG', message: '⚠️ Could not inject content script — make sure Maps tab is open', level: 'warn' });
            }
            broadcast({ type: 'RESUMED', remaining: state.queue.length });
          });
        } else {
          broadcast({ type: 'RESUMED', remaining: state.queue.length });
        }
      });
      break;

    case 'RECORD_EXTRACTED': {
      const record = msg.record;
      handleRecord(record).catch(e => {
        broadcast({ type: 'ERROR', message: 'Record handler crashed: ' + e.message });
      });
      break;
    }

    case 'EXTRACTION_DONE':
      state.status = 'done';
      persistState();
      stopKeepAlive();
      // NEW-FIX-3: await flushFailedRows properly — use promise chain
      flushFailedRows().then(() => {
        broadcast({ type: 'DONE', saved: state.saved, scraped: state.scraped });
      });
      break;

    case 'PROGRESS':
      broadcast({ type: 'PROGRESS', ...msg });
      persistState();
      break;

    case 'LOG':
      broadcast({ type: 'LOG', message: msg.message, level: msg.level });
      break;
  }
});

// ─── Start extraction ─────────────────────────────────────────────────────────
function startExtraction(config) {
  state = {
    status:    'running',
    keyword:   config.keyword  || '',
    limit:     config.limit    ?? 0,
    sheetUrl:  config.sheetUrl || '',
    queue:     [],
    seenUrls:  new Set(), // NEW-FIX-2: always fresh Set on new extraction
    scraped:   0,
    saved:     0,
    errors:    0,
    mainTabId: config.tabId || null,
  };
  persistState();
  startKeepAlive();
  flushFailedRows();
}

// ─── Handle a single extracted record ────────────────────────────────────────
async function handleRecord(record) {
  state.scraped++;
  broadcast({ type: 'SCRAPED', count: state.scraped, name: record.name });

  const ok = await sendToSheet(state.sheetUrl, record);
  if (ok) {
    state.saved++;
    broadcast({ type: 'SAVED', count: state.saved, name: record.name, status: 'ok', record });
  } else {
    state.errors++;
    broadcast({ type: 'ERROR', message: `Sheet save failed: ${record.name}` });
    await queueFailedRow(state.sheetUrl, record);
    broadcast({ type: 'LOG', message: `⚠️ Queued for retry: ${record.name}`, level: 'warn' });
  }
  persistState();
}

// ─── Broadcast to popup ───────────────────────────────────────────────────────
function broadcast(msg) {
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch(e) {
    // popup might be closed — silently ignore
  }
}
