/**
 * content.js — MapHarvest v5.0
 *
 * All previous fixes retained +
 *  NEW-FIX-1: STOP_EXTRACTION এ content script এর _running/_stop properly sync হয়নি — 
 *             background থেকে STOP আসলে content script এর loop exit নিশ্চিত করা হয়েছে
 *  NEW-FIX-2: collectListings এ unlimited mode এ noNewCount check ছিল কিন্তু 
 *             _stop check missing ছিল inner loop এ — added
 *  NEW-FIX-3: extractDetailPanel এ rating parse — Maps এ rating "4.6" or "4.6 stars" দুভাবে থাকে
 *             আগে full text নিত, এখন শুধু numeric part নেয়
 *  NEW-FIX-4: mergeRecord এ city field background এ পাঠানো হচ্ছিল কিন্তু 
 *             HEADERS এ city নেই — Apps Script এ অপ্রয়োজনীয় field যাচ্ছিল (harmless কিন্তু clean করা হল)
 *  NEW-FIX-5: wait-for-detail panel এর maxWait 5000ms অনেক সময় কম — 8000ms করা হয়েছে
 *             slow connection এ panel load হওয়ার আগেই extract করছিল
 */

let _running = false;
let _stop    = false;

// ─── Message listener ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'START_EXTRACTION') {
    sendResponse({ ok: true });
    if (_running) {
      relay({ type: 'LOG', message: 'Already running — ignoring duplicate start', level: 'warn' });
      return;
    }
    runExtraction(msg.keyword, msg.limit, msg.sheetUrl);
  }
  if (msg.action === 'STOP_EXTRACTION') {
    _stop    = true;
    _running = false;
    // NEW-FIX-1: send acknowledgment back
    sendResponse && sendResponse({ ok: true });
  }
});

// ─── Main flow ────────────────────────────────────────────────────
async function runExtraction(keyword, limit, sheetUrl) {
  _running = true;
  _stop    = false;
  const unlimited = (limit === 0);

  log('Waiting for Maps results to load…', 'info');
  await wait(2500);

  if (_stop) { _running = false; return; }

  log('Scrolling to collect all listings…', 'info');
  const listings = await collectListings(limit, unlimited);

  if (_stop) { relay({ type: 'STOPPED' }); _running = false; return; }

  if (!listings.length) {
    log('No listings found. Check your keyword or try again.', 'err');
    chrome.runtime.sendMessage({ type: 'EXTRACTION_DONE' });
    _running = false;
    return;
  }

  log(`✓ Collected ${listings.length} listings. Extracting details…`, 'ok');
  relay({ type: 'PROGRESS', current: 0, total: listings.length, label: `Extracting 0 / ${listings.length}` });

  for (let i = 0; i < listings.length; i++) {
    if (_stop) { relay({ type: 'STOPPED' }); _running = false; return; }

    const item = listings[i];
    relay({ type: 'PROGRESS', current: i + 1, total: listings.length, label: `Extracting ${i+1} / ${listings.length}: ${item.name}` });
    log(`[${i+1}/${listings.length}] ${item.name}`, 'info');

    try {
      const el = findCardByHref(item.href) || findCardByName(item.name);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(400);
        el.click();
      } else {
        log(`Could not find card for ${item.name} — skipping`, 'warn');
        relay({ type: 'ERROR', message: `Card not found: ${item.name}` });
        continue;
      }

      // NEW-FIX-5: increased maxWait to 8000ms for slow connections
      await waitForDetailPanel(8000);

      const detail = await extractDetailPanel();
      const record = mergeRecord(item.basic, detail, keyword);

      chrome.runtime.sendMessage({ type: 'RECORD_EXTRACTED', record });

    } catch (e) {
      relay({ type: 'ERROR', message: `Error on ${item.name}: ${e.message}` });
    }

    await wait(1000);
  }

  _running = false;
  chrome.runtime.sendMessage({ type: 'EXTRACTION_DONE' });
}

// ─── Phase 1: Collect listings ────────────────────────────────────
async function collectListings(limit, unlimited) {
  const listings  = [];
  const seenHrefs = new Set();
  let noNewCount  = 0;

  while (!_stop) {
    const cards = getListingCards();

    for (const card of cards) {
      // NEW-FIX-2: check _stop inside inner loop too
      if (_stop) break;

      const href = getCardHref(card);
      const name = getCardName(card);

      if (!name) continue;
      const key = href || name;
      if (seenHrefs.has(key)) continue;
      seenHrefs.add(key);

      listings.push({
        name,
        href,
        basic: extractCardBasic(card),
      });

      if (!unlimited && listings.length >= limit) break;
    }

    relay({ type: 'LOG', message: `Scrolling… found ${listings.length} so far`, level: 'info' });
    if (!unlimited && listings.length >= limit) break;
    if (_stop) break;

    const panel = getScrollPanel();
    const prevSize = seenHrefs.size;
    if (panel) panel.scrollTop += 700;
    else window.scrollBy(0, 700);

    await wait(1600);

    if (seenHrefs.size === prevSize) {
      noNewCount++;
      if (noNewCount >= 4) { log('Reached end of results.', 'info'); break; }
    } else {
      noNewCount = 0;
    }
  }

  return listings;
}

// ─── Find card by href ────────────────────────────────────────────
function findCardByHref(href) {
  if (!href) return null;
  const a = document.querySelector(`a[href="${href}"]`);
  if (a) return a;
  const baseHref = href.split('?')[0];
  for (const a of document.querySelectorAll('a[href*="/maps/place/"]')) {
    if (a.href.startsWith(baseHref)) return a;
  }
  return null;
}

function findCardByName(name) {
  const cards = getListingCards();
  for (const c of cards) {
    if (getCardName(c) === name) return c;
  }
  return null;
}

// ─── Selectors ────────────────────────────────────────────────────
function getListingCards() {
  const selectors = [
    'a.hfpxzc[href*="/maps/place/"]',
    'div[role="feed"] a[href*="/maps/place/"]',
    'div.Nv2PK a[href*="/maps/place/"]',
    'a[href*="/maps/place/"]',
  ];
  for (const s of selectors) {
    const els = document.querySelectorAll(s);
    if (els.length > 1) return [...els];
  }
  return [];
}

function getScrollPanel() {
  return (
    document.querySelector('div[role="feed"]') ||
    document.querySelector('.m6QErb[aria-label]') ||
    document.querySelector('.m6QErb')
  );
}

function getCardHref(card) {
  return card.href || card.getAttribute?.('href') || '';
}

function getCardName(card) {
  const selectors = ['.fontHeadlineSmall', '.qBF1Pd', 'h3', '[class*="fontHeadline"]'];
  for (const s of selectors) {
    const el = card.querySelector?.(s);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  const label = card.getAttribute?.('aria-label') || '';
  return label.split('\n')[0].trim() || '';
}

function extractCardBasic(card) {
  const get = (...sels) => {
    for (const s of sels) {
      const el = card.querySelector?.(s);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  };
  return {
    name:        getCardName(card),
    rating:      parseRating(get('.MW4etd', '[aria-label*="stars"]', '.ceNzKf')),
    reviews:     get('.UY7F9', '.e4rVHe'),
    address:     get('.Io6YTe', '.W4Efsd:last-child span:last-child'),
    category:    get('.DkEaL', '.e4rVHe'),
    profileLink: getCardHref(card),
  };
}

// NEW-FIX-3: parse numeric rating only
function parseRating(rawRating) {
  if (!rawRating) return '';
  const m = rawRating.match(/(\d+\.?\d*)/);
  return m ? m[1] : rawRating;
}

// ─── Wait for detail panel ─────────────────────────────────────────
async function waitForDetailPanel(maxWait = 8000) {  // NEW-FIX-5: 8000ms
  const panelSelectors = [
    'h1.fontHeadlineLarge',
    'h1[class*="fontHeadline"]',
    '[data-attrid="title"] span',
    '.rogA2c',
  ];
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    for (const s of panelSelectors) {
      if (document.querySelector(s)) return true;
    }
    await wait(300);
  }
  return false;
}

// ─── Phase 2: Extract from detail panel ──────────────────────────
async function extractDetailPanel() {
  await wait(500);

  const name = getText(
    'h1.fontHeadlineLarge',
    'h1[class*="fontHeadline"]',
    '[data-attrid="title"] span',
  );

  const category = getText(
    'button.DkEaL',
    'span.DkEaL',
    '[jsaction*="category"] span',
  );

  // NEW-FIX-3: parse numeric rating from detail panel too
  const rawRating = getText(
    '.fontDisplayLarge',
    'span[aria-label*="stars"]',
    '.ceNzKf',
  );
  const rating = parseRating(rawRating);

  const reviews = getText(
    'button[aria-label*="reviews"] span',
    '.fontBodySmall[aria-label*="review"]',
    'span[aria-label*="reviews"]',
  );

  const address = getDataItem('address') ||
    getText(
      'button[data-item-id*="address"] .Io6YTe',
      '[data-section-id="ad"] .Io6YTe',
    );

  let phone = getDataItem('phone') || '';
  if (!phone) {
    for (const btn of document.querySelectorAll('button[aria-label*="phone"], [data-item-id*="phone"]')) {
      const lbl = btn.getAttribute('aria-label') || '';
      const m   = lbl.match(/[\d\s\-\+\(\)]{7,}/);
      if (m) { phone = m[0].trim(); break; }
    }
  }
  if (!phone) {
    const m = document.body.innerText.match(/(?:\+?88)?0[1-9]\d{8,9}/);
    if (m) phone = m[0];
  }

  let website = '';
  const EXCLUDE = ['google.com', 'goo.gl', 'maps.google', 'googleapis', 'googleusercontent'];
  for (const a of document.querySelectorAll('a[data-item-id*="authority"], a[href^="http"]')) {
    const h = a.href || '';
    if (!h) continue;
    const isExcluded = EXCLUDE.some(ex => h.includes(ex));
    if (!isExcluded) { website = h; break; }
  }

  let email = '';
  const emailMatch = document.body.innerText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) email = emailMatch[0];

  const hours = getText(
    '.o0Svhf span',
    'button[data-item-id*="oh"] .Io6YTe',
    '[data-section-id="oh"] span',
  );

  const profileLink = window.location.href;
  const city = extractCity(address);

  return { name, category, rating, reviews, address, phone, email, website, hours, profileLink, city };
}

// ─── City extraction ──────────────────────────────────────────────
function extractCity(address) {
  if (!address) return '';
  const cities = [
    'Dhaka','Chittagong','Rajshahi','Khulna','Sylhet','Barishal','Mymensingh',
    'Comilla','Narayanganj','Gazipur','Rangpur','Jessore','Bogura','Narsingdi',
    "Cox's Bazar",'Faridpur','Tangail','Dinajpur','Sirajganj','Pabna',
  ];
  const lower = address.toLowerCase();
  for (const c of cities) {
    if (lower.includes(c.toLowerCase())) return c;
  }
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/[a-zA-Z]{3,}/.test(parts[i]) && !/\d{4,}/.test(parts[i])) return parts[i];
  }
  return '';
}

// ─── Merge basic + detail ─────────────────────────────────────────
function mergeRecord(basic, detail, keyword) {
  // NEW-FIX-4: city sent separately but not a column in sheet — kept for Apps Script sheetName logic only
  return {
    name:        detail.name        || basic.name        || '',
    category:    detail.category    || basic.category    || '',
    rating:      detail.rating      || basic.rating      || '',
    reviews:     detail.reviews     || basic.reviews     || '',
    phone:       detail.phone       || '',
    email:       detail.email       || '',
    address:     detail.address     || basic.address     || '',
    website:     detail.website     || '',
    profileLink: detail.profileLink || basic.profileLink || '',
    hours:       detail.hours       || '',
    city:        detail.city        || '',   // used by Apps Script for sheet naming only
    keyword:     keyword            || '',
  };
}

// ─── DOM helpers ──────────────────────────────────────────────────
function getText(...selectors) {
  for (const s of selectors) {
    try {
      const el = document.querySelector(s);
      if (el && el.textContent.trim()) return el.textContent.trim();
    } catch(e) {}
  }
  return '';
}

function getDataItem(type) {
  try {
    const el = document.querySelector(
      `button[data-item-id*="${type}"] .Io6YTe, ` +
      `[data-section-id="${type.slice(0,2)}"] .Io6YTe, ` +
      `[aria-label*="${type}"] .Io6YTe`
    );
    return el ? el.textContent.trim() : '';
  } catch(e) { return ''; }
}

// ─── Utilities ────────────────────────────────────────────────────
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg, level) { relay({ type: 'LOG', message: msg, level }); }
function relay(payload) {
  try {
    chrome.runtime.sendMessage({ type: 'RELAY', payload });
  } catch(e) {}
}
