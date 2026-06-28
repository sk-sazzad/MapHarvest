/**
 * popup.js — Google Maps Data Extractor v5
 * Multi-keyword queue: extracts one keyword at a time, automatically moves to next
 */

const $ = id => document.getElementById(id);

const keywordsEl   = $('keywords');
const kwCount      = $('kw-count');
const kwQueue      = $('kw-queue');
const kwOverall    = $('kw-overall');
const kwOverallTxt = $('kw-overall-txt');
const kwOverallFill= $('kw-overall-fill');
const kwOverallPct = $('kw-overall-pct');
const sheetUrlEl   = $('sheet-url');
const btnTest      = $('btn-test');
const sheetDot     = $('sheet-dot');
const sheetStatus  = $('sheet-status');
const btnStart     = $('btn-start');
const btnPause     = $('btn-pause');
const btnStop      = $('btn-stop');
const btnResume    = $('btn-resume');
const resumeBanner = $('resume-banner');
const resumeTxt    = $('resume-txt');
const netBanner    = $('net-banner');
const progWrap     = $('prog-wrap');
const progFill     = $('prog-fill');
const progLbl      = $('prog-lbl');
const progPct      = $('prog-pct');
const stKw         = $('st-kw');
const stFound      = $('st-found');
const stSaved      = $('st-saved');
const stErr        = $('st-err');
const logEl        = $('log');
const btnCsv       = $('btn-csv');
const btnJson      = $('btn-json');
const histList     = $('hist-list');

// ─── State ───────────────────────────────────────────────────────
let limitMode      = 'unlimited';
let isRunning      = false;
let extractedData  = [];

// Multi-keyword queue state
let keywordList    = [];   // parsed keywords array
let kwCurrentIndex = 0;   // currently running keyword index
let kwDoneCount    = 0;   // how many keywords finished

// Initial tab visibility
$('tab-main').style.display    = 'block';
$('tab-history').style.display = 'none';

// ─── Tabs ─────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $('tab-main').style.display    = tab.dataset.tab === 'main'    ? 'block' : 'none';
    $('tab-history').style.display = tab.dataset.tab === 'history' ? 'block' : 'none';
    if (tab.dataset.tab === 'history') renderHistory();
  });
});

// ─── Limit toggle ─────────────────────────────────────────────────
document.querySelectorAll('.tog').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tog').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    limitMode = btn.dataset.val;
    $('custom-wrap').style.display = limitMode === 'custom' ? 'block' : 'none';
  });
});

// ─── Keyword textarea → live preview queue ────────────────────────
keywordsEl.addEventListener('input', updateKeywordPreview);

function parseKeywords(text) {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

function updateKeywordPreview() {
  const kws = parseKeywords(keywordsEl.value);
  kwCount.textContent = kws.length + (kws.length === 1 ? ' keyword' : ' keywords');
  renderKeywordQueue(kws, -1); // -1 = none active yet
}

function renderKeywordQueue(kws, activeIdx) {
  if (!kws.length) { kwQueue.innerHTML = ''; return; }
  kwQueue.innerHTML = kws.map((kw, i) => {
    let cls = 'kw-tag';
    let status = '';
    if (i < activeIdx)       { cls += ' done'; status = '✓'; }
    else if (i === activeIdx) { cls += ' active'; status = '⏳'; }
    return `
      <div class="${cls}" id="kw-tag-${i}">
        <span class="kw-tag-num">${i+1}</span>
        <span class="kw-tag-txt">${sanitizeHTML(kw)}</span>
        <span class="kw-tag-status">${status}</span>
      </div>`;
  }).join('');
}

function markKeywordDone(idx) {
  const tag = $(`kw-tag-${idx}`);
  if (tag) {
    tag.className = 'kw-tag done';
    tag.querySelector('.kw-tag-status').textContent = '✓';
  }
}

function markKeywordActive(idx) {
  const tag = $(`kw-tag-${idx}`);
  if (tag) {
    tag.className = 'kw-tag active';
    tag.querySelector('.kw-tag-status').textContent = '⏳';
    tag.scrollIntoView({ block: 'nearest' });
  }
}

function updateOverallProgress(done, total) {
  kwOverall.classList.add('show');
  kwOverallTxt.textContent = `Keyword ${done} / ${total}`;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  kwOverallFill.style.width = pct + '%';
  kwOverallPct.textContent  = pct + '%';
  stKw.textContent = `${done}/${total}`;
}

// ─── Load saved settings ──────────────────────────────────────────
chrome.storage.local.get(['sheetUrl', 'keywords', 'extractorState'], data => {
  if (data.sheetUrl)  { sheetUrlEl.value = data.sheetUrl; setSheet('Saved — click Test to verify', 'idle'); }
  if (data.keywords)  { keywordsEl.value = data.keywords; updateKeywordPreview(); }

  const s = data.extractorState;
  if (s && s.status === 'running' && Array.isArray(s.queue) && s.queue.length > 0) {
    resumeTxt.textContent = `Previous session: "${s.keyword}" — ${s.queue.length} listings remaining`;
    resumeBanner.classList.add('show');
  }
});

sheetUrlEl.addEventListener('change', () => chrome.storage.local.set({ sheetUrl: sheetUrlEl.value.trim() }));
keywordsEl.addEventListener('change', () => chrome.storage.local.set({ keywords: keywordsEl.value }));

// ─── Test Sheet ───────────────────────────────────────────────────
btnTest.addEventListener('click', async () => {
  const url = sheetUrlEl.value.trim();
  if (!url) { setSheet('Enter a URL first', 'err'); return; }
  setSheet('Testing…', 'idle');
  btnTest.textContent = '…';
  btnTest.disabled = true;
  try {
    const res  = await fetch(url);
    const json = await res.json();
    if (json.status === 'ok') {
      setSheet('Connected ✓', 'ok');
      addLog('Sheet connection successful!', 'ok');
      chrome.storage.local.set({ sheetUrl: url });
    } else {
      setSheet('Unexpected response — check URL', 'err');
      addLog('Sheet returned unexpected response', 'warn');
    }
  } catch(e) {
    setSheet('Connection failed — check URL', 'err');
    addLog('Connection error: ' + e.message, 'err');
  } finally {
    btnTest.textContent = 'Test';
    btnTest.disabled = false;
  }
});

// ─── Start ────────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  if (isRunning) return;

  const url = sheetUrlEl.value.trim();
  keywordList = parseKeywords(keywordsEl.value);

  if (!keywordList.length) { addLog('কমপক্ষে একটা keyword দাও!', 'warn'); return; }
  if (!url)                { addLog('Google Sheet URL দাও!', 'warn'); return; }

  const limit = limitMode === 'custom'
    ? (parseInt($('custom-limit').value) || 50)
    : 0;

  isRunning      = true;
  extractedData  = [];
  kwCurrentIndex = 0;
  kwDoneCount    = 0;

  resetUI();
  setRunning(true);
  renderKeywordQueue(keywordList, -1);
  updateOverallProgress(0, keywordList.length);

  // Save keywords
  chrome.storage.local.set({ keywords: keywordsEl.value, sheetUrl: url });

  addLog(`🚀 Starting ${keywordList.length} keyword(s) | Limit: ${limit === 0 ? 'All' : limit} per keyword`, 'info');

  // Start first keyword
  startKeyword(keywordList[0], 0, limit, url);
});

// ─── Start a single keyword extraction ───────────────────────────
function startKeyword(kw, idx, limit, sheetUrl) {
  kwCurrentIndex = idx;
  markKeywordActive(idx);
  addLog(`\n▶ [${idx+1}/${keywordList.length}] Starting: "${kw}"`, 'info');

  // Reset per-keyword progress
  progFill.style.width = '0%';
  progPct.textContent  = '0%';
  progLbl.textContent  = `Keyword ${idx+1}: ${kw}`;

  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(kw)}`;

  chrome.runtime.sendMessage({
    type: 'START_EXTRACTION',
    config: { keyword: kw, limit, sheetUrl, tabId: null }
  });

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tabId = tabs[0].id;

    // Update background state with correct tabId
    chrome.runtime.sendMessage({
      type: 'START_EXTRACTION',
      config: { keyword: kw, limit, sheetUrl, tabId }
    });

    chrome.tabs.update(tabId, { url: mapsUrl }, () => {
      let listenerFired = false;
      let tabUpdateListener = null;
      tabUpdateListener = function(id, info) {
        if (id === tabId && info.status === 'complete' && !listenerFired) {
          listenerFired = true;
          chrome.tabs.onUpdated.removeListener(tabUpdateListener);
          tabUpdateListener = null;
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              action: 'START_EXTRACTION',
              keyword: kw, limit, sheetUrl
            }, resp => {
              if (chrome.runtime.lastError) {
                addLog('Maps page connect failed — check tab', 'err');
                // Try next keyword anyway
                onKeywordDone(idx, limit, sheetUrl);
              }
            });
          }, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(tabUpdateListener);
    });
  });
}

// ─── Called when a keyword finishes ──────────────────────────────
function onKeywordDone(idx, limit, sheetUrl) {
  markKeywordDone(idx);
  kwDoneCount++;
  updateOverallProgress(kwDoneCount, keywordList.length);
  saveHistory(keywordList[idx], stSaved.textContent, stFound.textContent);

  const nextIdx = idx + 1;
  if (nextIdx < keywordList.length && !_stopped) {
    // Small delay between keywords
    addLog(`\n⏳ Next keyword in 3 seconds…`, 'info');
    setTimeout(() => {
      startKeyword(keywordList[nextIdx], nextIdx, limit, sheetUrl);
    }, 3000);
  } else {
    // All done
    addLog(`\n✅ All ${keywordList.length} keywords completed! Total saved: ${stSaved.textContent}`, 'ok');
    setRunning(false);
    isRunning = false;
    btnCsv.disabled  = extractedData.length === 0;
    btnJson.disabled = extractedData.length === 0;
    progFill.style.width = '100%';
    progPct.textContent  = '100%';
    progLbl.textContent  = 'All keywords completed!';
    kwOverall.classList.remove('show');
  }
}

let _stopped = false;

// ─── Pause / Resume ───────────────────────────────────────────────
function onPauseClick() {
  chrome.runtime.sendMessage({ type: 'PAUSE_EXTRACTION' });
  addLog('Pausing…', 'warn');
  btnPause.textContent = '▶ Resume';
  btnPause.removeEventListener('click', onPauseClick);
  btnPause.addEventListener('click', onResumeClick);
}
function onResumeClick() {
  chrome.runtime.sendMessage({ type: 'RESUME_EXTRACTION' });
  addLog('Resuming…', 'info');
  btnPause.textContent = '⏸';
  btnPause.removeEventListener('click', onResumeClick);
  btnPause.addEventListener('click', onPauseClick);
}
btnPause.addEventListener('click', onPauseClick);

// ─── Stop ─────────────────────────────────────────────────────────
btnStop.addEventListener('click', () => {
  _stopped = true;
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'STOP_EXTRACTION' });
  });
  chrome.runtime.sendMessage({ type: 'STOP_EXTRACTION' });
  addLog('⏹ Stopped by user.', 'warn');
  setRunning(false);
  isRunning = false;
});

// ─── Resume banner ────────────────────────────────────────────────
btnResume.addEventListener('click', () => {
  resumeBanner.classList.remove('show');
  chrome.storage.local.get(['extractorState'], r => {
    const s = r.extractorState || {};
    if (s.sheetUrl) sheetUrlEl.value = s.sheetUrl;
    chrome.runtime.sendMessage({ type: 'RESUME_EXTRACTION' });
    addLog('Resuming previous session…', 'info');
    setRunning(true);
    isRunning = true;
  });
});

// ─── Export ───────────────────────────────────────────────────────
btnCsv.addEventListener('click', () => {
  if (!extractedData.length) return;
  const headers = Object.keys(extractedData[0]);
  const bom  = '\uFEFF';
  const rows = [
    headers.join(','),
    ...extractedData.map(r =>
      headers.map(h => `"${(r[h] || '').replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n');
  downloadFile('maps_data.csv', bom + rows, 'text/csv;charset=utf-8');
});

btnJson.addEventListener('click', () => {
  if (!extractedData.length) return;
  downloadFile('maps_data.json', JSON.stringify(extractedData, null, 2), 'application/json');
});

function downloadFile(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ─── Messages from background ──────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  switch(msg.type) {

    case 'PROGRESS':
      if (msg.current) stFound.textContent = msg.current;
      updateProgress(msg.current, msg.total, msg.label);
      break;

    case 'SCRAPED':
      stFound.textContent = msg.count;
      break;

    case 'SAVED':
      stSaved.textContent = msg.count;
      if (msg.record) {
        extractedData.push(msg.record);
        btnCsv.disabled  = false;
        btnJson.disabled = false;
      }
      addLog(`✓ ${msg.name}`, 'ok');
      break;

    case 'ERROR':
      stErr.textContent = (parseInt(stErr.textContent) || 0) + 1;
      addLog('✗ ' + msg.message, 'err');
      break;

    case 'LOG':
      addLog(msg.message, msg.level || 'info');
      break;

    case 'DONE': {
      // One keyword finished — check if more to go
      addLog(`✓ Keyword "${keywordList[kwCurrentIndex]}" done — ${msg.saved} saved`, 'ok');
      const limit = limitMode === 'custom' ? (parseInt($('custom-limit').value) || 50) : 0;
      onKeywordDone(kwCurrentIndex, limit, sheetUrlEl.value.trim());
      break;
    }

    case 'STOPPED':
      addLog('⏹ Stopped.', 'warn');
      setRunning(false);
      isRunning = false;
      break;

    case 'PAUSED':
      addLog('⏸ Paused.', 'warn');
      break;

    case 'RESUMED':
      addLog(`▶ Resumed — ${msg.remaining} listings remaining`, 'ok');
      break;

    case 'AUTO_RESUMED':
      addLog('🟢 Auto-resumed after network reconnect', 'ok');
      netBanner.classList.remove('show');
      break;

    case 'NETWORK_OFFLINE':
      netBanner.classList.add('show');
      addLog('🔴 Network lost — paused', 'warn');
      break;

    case 'NETWORK_ONLINE':
      addLog('🟢 Network back', 'ok');
      break;
  }
});

// ─── History ──────────────────────────────────────────────────────
function saveHistory(kw, saved, scraped) {
  chrome.storage.local.get(['history'], r => {
    const hist = r.history || [];
    hist.unshift({ keyword: kw, saved, scraped, date: new Date().toLocaleString() });
    chrome.storage.local.set({ history: hist.slice(0, 50) });
  });
}

function renderHistory() {
  chrome.storage.local.get(['history'], r => {
    const hist = r.history || [];
    if (!hist.length) {
      histList.innerHTML = '<div class="hist-empty">No extraction history yet.</div>';
      return;
    }
    histList.innerHTML = hist.map(h => `
      <div class="hist-item">
        <div>
          <div class="hist-kw">${sanitizeHTML(h.keyword)}</div>
          <div class="hist-meta">${sanitizeHTML(h.date)}</div>
        </div>
        <div class="hist-badge">${parseInt(h.saved) || 0} saved</div>
      </div>
    `).join('');
  });
}

function sanitizeHTML(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── UI helpers ───────────────────────────────────────────────────
function setRunning(on) {
  _stopped = !on ? _stopped : false;
  btnStart.disabled    = on;
  btnStart.textContent = on ? '⏳ Extracting…' : '▶ Start Extraction';
  btnPause.classList.toggle('hidden', !on);
  btnStop.classList.toggle('hidden',  !on);
  progWrap.classList.toggle('show',   on);
  if (!on) kwOverall.classList.remove('show');
}

function updateProgress(cur, tot, label) {
  const pct = (tot > 0) ? Math.min(100, Math.round((cur / tot) * 100)) : 0;
  progFill.style.width = pct + '%';
  progPct.textContent  = pct + '%';
  progLbl.textContent  = label || `${cur} / ${tot}`;
}

function resetUI() {
  stKw.textContent     = '0';
  stFound.textContent  = '0';
  stSaved.textContent  = '0';
  stErr.textContent    = '0';
  progFill.style.width = '0%';
  progPct.textContent  = '0%';
  logEl.innerHTML      = '';
  btnCsv.disabled      = true;
  btnJson.disabled     = true;
  btnPause.textContent = '⏸';
  btnPause.removeEventListener('click', onResumeClick);
  btnPause.removeEventListener('click', onPauseClick);
  btnPause.addEventListener('click', onPauseClick);
}

function setSheet(text, st) {
  sheetStatus.textContent = text;
  sheetDot.className = 'dot' + (st==='ok' ? ' ok' : st==='err' ? ' err' : st==='warn' ? ' warn' : '');
}

function addLog(msg, type = 'info') {
  const span = document.createElement('span');
  span.className   = 'l-' + type;
  span.textContent = (type !== 'info' || msg.startsWith('\n')
    ? '' : new Date().toLocaleTimeString() + ' ') + msg + '\n';
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
  // Keep max 150 entries
  while (logEl.children.length > 150) logEl.removeChild(logEl.firstChild);
}
