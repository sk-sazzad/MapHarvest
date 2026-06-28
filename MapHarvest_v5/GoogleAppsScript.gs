/**
 * ═══════════════════════════════════════════════════════════════════
 *  Google Maps Data Extractor v3 — Google Apps Script (Bug-Fixed)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  SETUP:
 *  1. Google Sheet খোলো → Extensions → Apps Script
 *  2. সব delete করো → এই পুরো code paste করো → Save (Ctrl+S)
 *  3. Deploy → New Deployment
 *     • Type        : Web App
 *     • Execute as  : Me
 *     • Access      : Anyone
 *  4. Deploy → Authorize → Web App URL copy করো
 *  5. Extension popup এ সেই URL paste করো
 *
 *  Bug Fixes:
 *  FIX-1: isDuplicate এখন সব existing array-length গুলো থেকে min নেয় (array mismatch crash fix)
 *  FIX-2: sanitize() regex এ character class escape fix — এটা silent bug ছিল
 *  FIX-3: doPost এ e.postData null হলে crash হত — guard added
 *  FIX-4: getOrCreateSheet এ sheet.getLastRow()===0 check — header already exists এ duplicate header bug fix
 *  FIX-5: appendRow এ row length mismatch protection
 *  FIX-6: Lock service added — concurrent requests এ data corruption prevent করে
 * ═══════════════════════════════════════════════════════════════════
 */

const MASTER_SHEET = 'All Data';

const HEADERS = [
  'Name', 'Category', 'Rating', 'Reviews',
  'Phone', 'Email', 'Address', 'Website',
  'Profile Link', 'Hours', 'Keyword', 'Extracted At'
];

const HEADER_BG    = '#1a1f3a';
const HEADER_COLOR = '#6ab4f5';

// ── Health check (GET ping) ───────────────────────────────────────
function doGet(e) {
  return json({ status: 'ok', message: 'Maps Extractor v4 is running.' });
}

// ── Receive extracted record (POST) ──────────────────────────────
function doPost(e) {
  // FIX-3: guard against missing postData
  if (!e || !e.postData || !e.postData.contents) {
    return json({ status: 'error', message: 'No data received' });
  }

  // FIX-6: use lock to prevent race conditions on concurrent requests
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // wait up to 10s
  } catch(lockErr) {
    return json({ status: 'error', message: 'Server busy — retry in a moment' });
  }

  try {
    const data = JSON.parse(e.postData.contents);

    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = getOrCreateSheet(ss, MASTER_SHEET);

    // ── 3-Layer Duplicate check ──
    const dupResult = isDuplicate(masterSheet, data);
    if (dupResult) {
      return json({ status: 'skip', message: 'Duplicate: ' + dupResult });
    }

    // ── Category·City sheet ──
    const sheetName = buildSheetName(data);
    const catSheet  = getOrCreateSheet(ss, sheetName);

    const row = buildRow(data);
    appendRow(masterSheet, row);
    appendRow(catSheet, row);

    return json({ status: 'ok', message: 'Saved to ' + sheetName });

  } catch(err) {
    return json({ status: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ── 3-Layer duplicate check ───────────────────────────────────────
function isDuplicate(sheet, data) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const rowCount = lastRow - 1;

  const profileLinks = getCol(sheet, rowCount, 9);
  const names        = getCol(sheet, rowCount, 1);
  const phones       = getCol(sheet, rowCount, 5);
  const addresses    = getCol(sheet, rowCount, 7);

  const incomingLink = clean(data.profileLink);
  const incomingName = clean(data.name).toLowerCase();
  const incomingPhone= clean(data.phone);
  const incomingAddr = clean(data.address).toLowerCase();

  // FIX-1: use min length to avoid array index mismatch crash
  const len = Math.min(profileLinks.length, names.length, phones.length, addresses.length);

  for (let i = 0; i < len; i++) {
    // Layer 1: Profile Link
    if (incomingLink && clean(profileLinks[i]) === incomingLink) {
      return 'Profile Link match';
    }
    // Layer 2: Name + Phone
    if (
      incomingName && incomingPhone &&
      clean(names[i]).toLowerCase() === incomingName &&
      clean(phones[i])              === incomingPhone
    ) {
      return 'Name + Phone match';
    }
    // Layer 3: Name + Address
    if (
      incomingName && incomingAddr &&
      clean(names[i]).toLowerCase()    === incomingName &&
      clean(addresses[i]).toLowerCase() === incomingAddr
    ) {
      return 'Name + Address match';
    }
  }
  return false;
}

function getCol(sheet, rowCount, col) {
  if (rowCount < 1) return [];
  return sheet.getRange(2, col, rowCount, 1).getValues().flat();
}

// ── Build sheet name: Category · City ────────────────────────────
function buildSheetName(data) {
  const category = sanitize(data.category || 'Unknown');
  const city     = sanitize(data.city || extractCityFromAddress(data.address || '') || 'Unknown');
  return (category + ' · ' + city).substring(0, 100);
}

function extractCityFromAddress(address) {
  const cities = [
    'Dhaka','Chittagong','Rajshahi','Khulna','Sylhet','Barishal',
    'Mymensingh','Comilla','Narayanganj','Gazipur','Rangpur',
    'Jessore','Bogura','Narsingdi','Faridpur','Tangail','Dinajpur',
    'Sirajganj','Pabna',"Cox's Bazar",
  ];
  const lower = address.toLowerCase();
  for (const c of cities) {
    if (lower.indexOf(c.toLowerCase()) !== -1) return c;
  }
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/[a-zA-Z]{3,}/.test(parts[i]) && !/\d{4,}/.test(parts[i])) return parts[i];
  }
  return '';
}

// ── Build row ─────────────────────────────────────────────────────
function buildRow(data) {
  return [
    clean(data.name),
    clean(data.category),
    clean(data.rating),
    clean(data.reviews),
    clean(data.phone),
    clean(data.email),
    clean(data.address),
    clean(data.website),
    clean(data.profileLink),
    clean(data.hours),
    clean(data.keyword),
    new Date().toLocaleString('en-GB'),
  ];
}

// ── Append row with alternating color ─────────────────────────────
function appendRow(sheet, row) {
  // FIX-5: ensure row matches HEADERS length
  while (row.length < HEADERS.length) row.push('');
  row = row.slice(0, HEADERS.length);

  sheet.appendRow(row);
  const lastRow = sheet.getLastRow();
  if (lastRow % 2 === 0) {
    sheet.getRange(lastRow, 1, 1, HEADERS.length).setBackground('#f0f4ff');
  }
}

// ── Get or create sheet ───────────────────────────────────────────
function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    setupHeader(sheet);
  } else {
    // FIX-4: only add header if sheet is truly empty (row 0)
    // getLastRow() returns 0 on empty sheet, 1 if only header exists
    if (sheet.getLastRow() === 0) {
      setupHeader(sheet);
    }
  }
  return sheet;
}

function setupHeader(sheet) {
  const range = sheet.getRange(1, 1, 1, HEADERS.length);
  range.setValues([HEADERS]);
  range.setFontWeight('bold')
       .setBackground(HEADER_BG)
       .setFontColor(HEADER_COLOR)
       .setHorizontalAlignment('center')
       .setFontSize(11);
  sheet.setFrozenRows(1);
  const widths = [200, 140, 70, 90, 130, 180, 250, 200, 300, 130, 200, 160];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

// ── Utilities ─────────────────────────────────────────────────────
function clean(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

// FIX-2: correct regex escape in character class
function sanitize(str) {
  return String(str || '')
    .replace(/[\[\]*?\/\\:']/g, '')  // fixed: proper escaping
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50) || 'Unknown';
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Test function ─────────────────────────────────────────────────
function testRow() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const master = getOrCreateSheet(ss, MASTER_SHEET);
  const data   = {
    name: 'BCS Confidence Rajshahi', category: 'Coaching center',
    rating: '4.9', reviews: '259', phone: '01711-304281', email: '',
    address: 'Kumar Para Union, Rajshahi', website: '',
    profileLink: 'https://maps.google.com/test123',
    hours: 'Opens 9 AM', city: 'Rajshahi', keyword: 'coaching in rajshahi',
  };
  const dup = isDuplicate(master, data);
  Logger.log(dup ? 'Duplicate: ' + dup : 'Not a duplicate — adding');
  if (!dup) {
    const sheetName = buildSheetName(data);
    const catSheet  = getOrCreateSheet(ss, sheetName);
    appendRow(master, buildRow(data));
    appendRow(catSheet, buildRow(data));
    Logger.log('Row added to: ' + sheetName);
  }
}
