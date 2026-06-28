/**
 * content.js — MapHarvest v5.1
 * NEW: Reviews extraction — first 20 reviews per business
 *      Extracts: reviewer name, rating, text, image URLs, video URLs
 *      Sent as JSON string in record.reviewsJson
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

      await waitForDetailPanel(8000);
      const detail = await extractDetailPanel();

      // ── NEW: Extract reviews ──
      log(`  → Extracting reviews for ${item.name}…`, 'info');
      const reviewsJson = await extractReviews(20);
      log(`  → Got ${reviewsJson.length} reviews`, 'info');

      const record = mergeRecord(item.basic, detail, keyword, reviewsJson);
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
      if (_stop) break;
      const href = getCardHref(card);
      const name = getCardName(card);
      if (!name) continue;
      const key = href || name;
      if (seenHrefs.has(key)) continue;
      seenHrefs.add(key);
      listings.push({ name, href, basic: extractCardBasic(card) });
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

// ─── NEW: Extract Reviews ─────────────────────────────────────────
async function extractReviews(maxCount = 20) {
  const reviews = [];

  try {
    // Click "Reviews" tab
    const reviewTab = findReviewTab();
    if (!reviewTab) {
      log('  Reviews tab not found — skipping', 'warn');
      return reviews;
    }

    reviewTab.click();
    await wait(2000);

    // Scroll review panel to load reviews
    const reviewPanel = getReviewScrollPanel();
    let noNewCount = 0;
    let lastCount  = 0;

    while (reviews.length < maxCount && noNewCount < 3) {
      if (_stop) break;

      const cards = getReviewCards();

      for (const card of cards) {
        if (reviews.length >= maxCount) break;

        const reviewer = getReviewerName(card);
        if (!reviewer) continue;

        // Deduplicate by reviewer + text combo
        const text = getReviewText(card);
        const key  = reviewer + '|' + text.slice(0, 30);
        if (reviews.some(r => r._key === key)) continue;

        const rating = getReviewRating(card);
        const images = getReviewImages(card);
        const videos = getReviewVideos(card);

        reviews.push({ _key: key, reviewer, rating, text, images, videos });
      }

      if (reviews.length >= maxCount) break;

      // Scroll to load more
      if (reviewPanel) reviewPanel.scrollTop += 600;
      else window.scrollBy(0, 600);
      await wait(1200);

      if (reviews.length === lastCount) {
        noNewCount++;
      } else {
        noNewCount = 0;
        lastCount  = reviews.length;
      }
    }

    // Go back to Overview tab
    const overviewTab = findOverviewTab();
    if (overviewTab) { overviewTab.click(); await wait(1000); }

  } catch(e) {
    log('Reviews extraction error: ' + e.message, 'warn');
  }

  // Remove internal _key before returning
  return reviews.map(({ _key, ...r }) => r);
}

// ─── Review tab finders ───────────────────────────────────────────
function findReviewTab() {
  const tabs = document.querySelectorAll(
    'button[role="tab"], [role="tablist"] button, .hh2c6, [data-tab-index]'
  );
  for (const t of tabs) {
    const txt = t.textContent.toLowerCase();
    if (txt.includes('review') || txt.includes('রিভিউ')) return t;
  }
  // Fallback: aria-label
  return document.querySelector('[aria-label*="Reviews"], [aria-label*="reviews"]');
}

function findOverviewTab() {
  const tabs = document.querySelectorAll('button[role="tab"], [role="tablist"] button');
  for (const t of tabs) {
    const txt = t.textContent.toLowerCase();
    if (txt.includes('overview') || txt.includes('about')) return t;
  }
  return null;
}

function getReviewScrollPanel() {
  return (
    document.querySelector('.m6QErb[aria-label*="review"]') ||
    document.querySelector('.m6QErb[data-value="Reviews"]') ||
    document.querySelector('div[role="main"] .m6QErb') ||
    document.querySelector('.m6QErb')
  );
}

// ─── Review card selectors ────────────────────────────────────────
function getReviewCards() {
  return [
    ...document.querySelectorAll(
      'div[data-review-id], ' +
      '[class*="jJc9Ad"], ' +
      'div.MyEned, ' +
      '[jslog*="review"]'
    )
  ].filter(el => el.querySelector('[class*="d4r55"], .wiI7pd, [class*="review-full-text"]'));
}

function getReviewerName(card) {
  const el = card.querySelector(
    '.d4r55, [class*="d4r55"], ' +
    '.kvMYJc, [class*="kvMYJc"], ' +
    'button[class*="WEBjve"] div, ' +
    '[aria-label*="Photo of"]'
  );
  if (el) return el.textContent.trim();

  // Fallback: aria-label from profile button
  const btn = card.querySelector('button[aria-label]');
  if (btn) {
    const lbl = btn.getAttribute('aria-label') || '';
    if (lbl && !lbl.toLowerCase().includes('photo')) return lbl.trim();
  }
  return '';
}

function getReviewRating(card) {
  // aria-label like "4 stars"
  const starEl = card.querySelector(
    '[aria-label*="star"], [aria-label*="Star"], ' +
    'span[role="img"][aria-label]'
  );
  if (starEl) {
    const lbl = starEl.getAttribute('aria-label') || '';
    const m   = lbl.match(/(\d+)/);
    return m ? parseInt(m[1]) : null;
  }
  return null;
}

function getReviewText(card) {
  // Try expanded text first
  const expandedEl = card.querySelector(
    '.wiI7pd, [class*="wiI7pd"], ' +
    '[jslog*="review-full-text"], ' +
    'span[data-expandable-section]'
  );
  if (expandedEl && expandedEl.textContent.trim()) {
    return expandedEl.textContent.trim();
  }

  // Click "More" button if available to expand text
  const moreBtn = card.querySelector('button[jsaction*="pane.review.expandReview"], .w8nwRe');
  if (moreBtn) {
    try { moreBtn.click(); } catch(e) {}
    const expanded = card.querySelector('.wiI7pd, [class*="wiI7pd"]');
    if (expanded) return expanded.textContent.trim();
  }

  return expandedEl ? expandedEl.textContent.trim() : '';
}

function getReviewImages(card) {
  const urls = [];
  const imgs = card.querySelectorAll(
    'button[jsaction*="pane.review.photo"] img, ' +
    '.Evocfe img, ' +
    '[data-photo-index] img, ' +
    '.YkuOqf img'
  );
  for (const img of imgs) {
    const src = img.src || img.getAttribute('data-src') || '';
    if (src && src.startsWith('http') && !src.includes('profile') && !src.includes('avatar')) {
      // Get highest quality version
      const hiRes = src.replace(/=w\d+-h\d+/, '=w800-h800').replace(/=s\d+/, '=s800');
      urls.push(hiRes);
    }
  }
  return [...new Set(urls)]; // deduplicate
}

function getReviewVideos(card) {
  const urls = [];
  const videos = card.querySelectorAll(
    'video[src], video source[src], ' +
    'button[jsaction*="review.video"] video'
  );
  for (const v of videos) {
    const src = v.src || v.getAttribute('src') || '';
    if (src && src.startsWith('http')) urls.push(src);
  }
  return [...new Set(urls)];
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

// ─── Listing selectors ────────────────────────────────────────────
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

function parseRating(rawRating) {
  if (!rawRating) return '';
  const m = rawRating.match(/(\d+\.?\d*)/);
  return m ? m[1] : rawRating;
}

// ─── Wait for detail panel ────────────────────────────────────────
async function waitForDetailPanel(maxWait = 8000) {
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

// ─── Extract detail panel ─────────────────────────────────────────
async function extractDetailPanel() {
  await wait(500);

  const name     = getText('h1.fontHeadlineLarge', 'h1[class*="fontHeadline"]', '[data-attrid="title"] span');
  const category = getText('button.DkEaL', 'span.DkEaL', '[jsaction*="category"] span');
  const rating   = parseRating(getText('.fontDisplayLarge', 'span[aria-label*="stars"]', '.ceNzKf'));
  const reviews  = getText('button[aria-label*="reviews"] span', '.fontBodySmall[aria-label*="review"]', 'span[aria-label*="reviews"]');
  const address  = getDataItem('address') || getText('button[data-item-id*="address"] .Io6YTe', '[data-section-id="ad"] .Io6YTe');

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
    if (!EXCLUDE.some(ex => h.includes(ex))) { website = h; break; }
  }

  let email = '';
  const emailMatch = document.body.innerText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) email = emailMatch[0];

  const hours = getText('.o0Svhf span', 'button[data-item-id*="oh"] .Io6YTe', '[data-section-id="oh"] span');
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

// ─── Merge record ─────────────────────────────────────────────────
function mergeRecord(basic, detail, keyword, reviewsJson) {
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
    city:        detail.city        || '',
    keyword:     keyword            || '',
    // NEW: reviews as JSON string
    reviewsJson: JSON.stringify(reviewsJson || []),
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

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg, level) { relay({ type: 'LOG', message: msg, level }); }
function relay(payload) {
  try { chrome.runtime.sendMessage({ type: 'RELAY', payload }); } catch(e) {}
}
