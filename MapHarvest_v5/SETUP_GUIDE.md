# Google Maps Data Extractor v2 — Setup Guide

## 📁 Files
```
gmaps-v2/
├── manifest.json
├── popup.html
├── src/
│   ├── popup.js
│   ├── content.js
│   └── background.js
├── icons/
└── GoogleAppsScript.gs   ← Paste this in Google Sheet
```

---

## STEP 1 — Google Sheet Setup

1. Google Sheet খোলো (নতুন বা পুরনো)
2. **Extensions → Apps Script**
3. সব delete → `GoogleAppsScript.gs` এর সব code paste করো
4. **Ctrl+S** → Save
5. **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Access: **Anyone**
6. **Deploy** → Authorize → **Web App URL copy করো**

---

## STEP 2 — Chrome Install

1. `gmaps-v2.zip` extract করো
2. Chrome → `chrome://extensions/` → **Developer mode ON**
3. **Load unpacked** → `gmaps-v2` folder select
4. Done ✓

## STEP 2 — Firefox Install

1. Firefox → `about:debugging` → **This Firefox**
2. **Load Temporary Add-on** → `manifest.json` select
3. Done ✓

---

## STEP 3 — Use

1. Extension icon click → Web App URL paste → **Test** (Connected ✓)
2. Keyword দাও → Limit choose → **▶ Start**
3. Maps automatically open হবে, data extract হবে, Sheet এ যাবে

---

## Sheet Structure

| Sheet Name | Contains |
|-----------|---------|
| **All Data** | সব records (master) |
| **Coaching Center · Rajshahi** | Auto-created per category+city |
| **Hospital · Dhaka** | Auto-created |

---

## Features

- ✅ Duplicate check: Profile Link → Name+Phone → Name+Address
- ✅ Auto-resume: network গেলে pause, আসলে resume
- ✅ Failed rows retry: save fail হলে queue করে retry
- ✅ Export: CSV + JSON download
- ✅ History: কোন keyword এ কত extract হয়েছে
- ✅ Chrome + Firefox উভয়ে কাজ করে
