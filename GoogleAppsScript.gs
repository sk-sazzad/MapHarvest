/**
 * ═══════════════════════════════════════════════════════════════════
 *  MapHarvest v5.1 — Google Apps Script
 *  NEW: Reviews (JSON) column added as last column
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
 *  Reviews JSON format (per cell):
 *  [
 *    {"reviewer":"Name","rating":4,"text":"...","images":["url"],"videos":[]},
 *    ...
 *  ]
 * ═══════════════════════════════════════════════════════════════════
 */

const MASTER_SHEET = 'All Data';

const HEADERS = [
  'Name', 'Category', 'Rating', 'Reviews',
  'Phone', 'Email', 'Address', 'Website',
  'Profile Link', 'Hours', 'Keyword', 'Extracted At',
  'Reviews (JSON)'   // ← NEW
];

const HEADER_BG    = '#1a1f3a';
const HEADER_COLOR = '#6ab4f5';

// ── Health check ──────────────────────────────────────────────────
function doGet(e) {
  return json({ status: 'ok', message: 'MapHarvest v5.1 is running.' });
}

// ── Receive record (POST) ─────────────────────────────────────────
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return json({ status: 'error', message: 'No data received' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch(lockErr) {
    return json({ status: 'error', message: 'Server busy — retry in a moment' });
  }

  try {
    const data = JSON.parse(e.postData.contents);

    const ss          = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = getOrCreateSheet(ss, MASTER_SHEET);

    // 3-Layer Duplicate check
    const dupResult = isDuplicate(masterSheet, data);
    if (dupResult) {
      return json({ status: 'skip', message: 'Duplicate: ' + dupResult });
    }

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

  const len = Math.min(profileLinks.length, names.length, phones.length, addresses.length);

  for (let i = 0; i < len; i++) {
    if (incomingLink && clean(profileLinks[i]) === incomingLink) return 'Profile Link match';
    if (incomingName && incomingPhone &&
        clean(names[i]).toLowerCase() === incomingName &&
        clean(phones[i])              === incomingPhone) return 'Name + Phone match';
    if (incomingName && incomingAddr &&
        clean(names[i]).toLowerCase()     === incomingName &&
        clean(addresses[i]).toLowerCase() === incomingAddr) return 'Name + Address match';
  }
  return false;
}

function getCol(sheet, rowCount, col) {
  if (rowCount < 1) return [];
  return sheet.getRange(2, col, rowCount, 1).getValues().flat();
}

// ── Build sheet name ──────────────────────────────────────────────
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
  // reviewsJson — already a JSON string from content.js
  // Store as-is in the cell (plain text)
  let reviewsCell = '';
  if (data.reviewsJson) {
    try {
      // Validate it's proper JSON, then store as string
      const parsed = JSON.parse(data.reviewsJson);
      reviewsCell  = JSON.stringify(parsed);
    } catch(e) {
      reviewsCell = data.reviewsJson || '';
    }
  }

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
    reviewsCell,   // ← NEW: Reviews JSON
  ];
}

// ── Append row ────────────────────────────────────────────────────
function appendRow(sheet, row) {
  while (row.length < HEADERS.length) row.push('');
  row = row.slice(0, HEADERS.length);

  sheet.appendRow(row);
  const lastRow = sheet.getLastRow();
  if (lastRow % 2 === 0) {
    // Alternating color only on first 12 columns (not reviews JSON column — too wide)
    sheet.getRange(lastRow, 1, 1, HEADERS.length - 1).setBackground('#f0f4ff');
  }

  // Wrap text on the Reviews column so it doesn't overflow
  sheet.getRange(lastRow, HEADERS.length).setWrap(true);
}

// ── Get or create sheet ───────────────────────────────────────────
function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    setupHeader(sheet);
  } else {
    if (sheet.getLastRow() === 0) setupHeader(sheet);
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

  // Column widths — last column (Reviews JSON) wider
  const widths = [200, 140, 70, 90, 130, 180, 250, 200, 300, 130, 200, 160, 400];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

// ── Utilities ─────────────────────────────────────────────────────
function clean(val) {
  if (val === undefined || val === null) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

function sanitize(str) {
  return String(str || '')
    .replace(/[\[\]*?\/\\:']/g, '')
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
    name: 'Test Business', category: 'Coaching center',
    rating: '4.9', reviews: '259', phone: '01711-304281', email: '',
    address: 'Kumar Para, Rajshahi', website: '',
    profileLink: 'https://maps.google.com/test123',
    hours: 'Opens 9 AM', city: 'Rajshahi', keyword: 'coaching in rajshahi',
    reviewsJson: JSON.stringify([
      { reviewer: 'Md. Ziaul', rating: 4, text: 'Great place!', images: ['https://example.com/img1.jpg'], videos: [] },
      { reviewer: 'Sarah Khan', rating: 5, text: 'Amazing!', images: [], videos: [] },
    ]),
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
