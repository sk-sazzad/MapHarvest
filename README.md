<div align="center">

<img src="icons/icon128.png" width="100" alt="MapHarvest Icon"/>

# MapHarvest

> Extract business data from Google Maps and save it directly to Google Sheets — automatically.

[![Version](https://img.shields.io/badge/version-5.1.0-crimson?style=for-the-badge)](https://github.com/sk-sazzad/MapHarvest/releases)
[![Manifest](https://img.shields.io/badge/manifest-v2-555?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv2/)
[![Chrome](https://img.shields.io/badge/Chrome-✓-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)
[![Firefox](https://img.shields.io/badge/Firefox-✓-FF7139?style=for-the-badge&logo=firefox&logoColor=white)](https://www.mozilla.org/firefox/)
[![License](https://img.shields.io/badge/license-MIT-2ea44f?style=for-the-badge)](LICENSE)

<br/>

### ⬇️ Download

[![Download MapHarvest](https://img.shields.io/badge/⬇%20Download%20MapHarvest%20v5.1.0-crimson?style=for-the-badge&logoColor=white)](https://github.com/sk-sazzad/MapHarvest/releases/latest/download/MapHarvest_v5.zip)

*Supports Chrome and Firefox · No account required · Free forever*

<br/>

---

</div>

## ✦ What is MapHarvest?

MapHarvest is a browser extension built for lead generation and business research. It automates the entire data collection process from Google Maps — scrolling through results, opening each business profile, extracting structured data including customer reviews, and saving everything directly to your Google Sheet in real time.

**No copy-pasting. No manual work. Just data.**

---

## ✦ Features

<table>
<tr>
<td width="50%">

**🔍 Multi-keyword Queue**
Add multiple keywords — each runs automatically after the previous finishes. Set it and walk away.

**🧠 3-Layer Duplicate Detection**
Profile Link → Name + Phone → Name + Address. No business appears twice.

**📊 Auto Sheet Organization**
Each Category + City gets its own tab automatically. One master sheet holds everything.

**💬 Review Extraction**
First 20 reviews per business — reviewer name, star rating, full text, image URLs, video URLs — stored as JSON.

</td>
<td width="50%">

**♻️ Auto-Resume**
Network drops or browser closes? Extraction resumes exactly where it stopped.

**🔁 Failed Row Retry Queue**
Sheet save fails? The row is queued locally and retried automatically. Zero data loss.

**⬇️ CSV & JSON Export**
Download all extracted data at any point — during or after extraction.

**🕒 Extraction History**
Every keyword, date, and record count — tracked automatically in the History tab.

</td>
</tr>
</table>

---

## ✦ Data Extracted

### Business Fields

| # | Column | Field | Example |
|---|--------|-------|---------|
| A | Name | Business name | BCS Confidence Rajshahi |
| B | Category | Type from Maps profile | Coaching center |
| C | Rating | Star rating | 4.9 |
| D | Reviews | Total review count | 259 |
| E | Phone | Phone number | 01711-304281 |
| F | Email | Email (if listed) | info@example.com |
| G | Address | Full address | Kumar Para Union, Rajshahi |
| H | Website | Business website | bcsconfidence.com |
| I | Profile Link | Direct Maps URL | maps.google.com/place/... |
| J | Hours | Opening hours | Opens 9 AM Sun |
| K | Keyword | Search keyword used | coaching centers in rajshahi |
| L | Extracted At | Timestamp | 28/06/2026, 14:32 |
| M | Reviews (JSON) | First 20 reviews | `[{"reviewer":...}]` |

### Reviews JSON (Column M)

```json
[
  {
    "reviewer": "Md. Ziaul Hoque Emon",
    "rating": 4,
    "text": "The environment is wonderful. Highly recommended for BCS preparation.",
    "images": ["https://lh5.googleusercontent.com/..."],
    "videos": []
  },
  {
    "reviewer": "Sarah Khan",
    "rating": 5,
    "text": "Best coaching in Rajshahi!",
    "images": [],
    "videos": ["https://video.google.com/..."]
  }
]
```

---

## ✦ Google Sheet Structure

```
📗 MapHarvest — Extracted Data
│
├── 📋 All Data                       ← Master sheet (every record from all keywords)
│
├── 📋 Coaching Center · Rajshahi     ← Auto-created per Category + City
├── 📋 Hospital · Dhaka               ← Auto-created
├── 📋 Restaurant · Chittagong        ← Auto-created
└── ...
```

Same category + same city from different keywords → same sheet tab. No duplication.

---

## ✦ Installation

### Step 1 — Google Sheet Setup (One-time)

1. Open a new Google Sheet
2. Go to **Extensions → Apps Script**
3. Delete everything → paste the full contents of `GoogleAppsScript.gs` → **Ctrl+S**
4. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Access: **Anyone**
5. Click **Deploy** → Authorize → **Copy the Web App URL**

> The URL is saved in the extension after the first connection. You won't need to re-enter it in future sessions.

---

### Step 2 — Install Extension

**Chrome**
```
1. Go to chrome://extensions/
2. Enable Developer mode (top-right toggle)
3. Click Load unpacked → Select the MapHarvest folder
```

**Firefox**
```
1. Go to about:debugging → This Firefox
2. Click Load Temporary Add-on → Select manifest.json
```

---

### Step 3 — Connect & Run

1. Click the **MapHarvest** icon in your toolbar
2. Paste your **Web App URL** → Click **Test** → `● Connected ✓`
3. Enter keywords (one per line) → Set limit → Click **▶ INJECT**

---

## ✦ How It Works

```
You enter keywords
       ↓
MapHarvest opens Google Maps
       ↓
Scrolls through all results
       ↓
Clicks each business profile
       ↓
Extracts: name, phone, email, address, website, hours, rating, reviews...
       ↓
Opens Reviews tab → collects first 20 reviews
       ↓
Sends to Google Sheet in real time
       ↓
Moves to next keyword automatically
```

---

## ✦ Auto-Resume

| Event | What happens |
|-------|-------------|
| Network drops | Extraction pauses automatically |
| Network returns | Extraction resumes automatically in 3 seconds |
| Browser closed | Resume banner appears next time you open the extension |
| Sheet save fails | Row queued locally, retried automatically |

---

## ✦ File Structure

```
MapHarvest/
├── manifest.json          ← Extension config (Chrome + Firefox)
├── popup.html             ← Popup UI
├── GoogleAppsScript.gs    ← Paste into Google Sheet Apps Script
├── src/
│   ├── popup.js           ← UI logic, queue, history, export
│   ├── content.js         ← Core extractor (runs in Maps tab)
│   └── background.js      ← State, keep-alive, retry queue
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## ✦ Changelog

**v5.1.0** — Reviews extraction (20 per business · name, rating, text, images, videos · stored as JSON in column M)

**v5.0.0** — Multi-keyword queue · fixed header/footer popup · history tab · CSV/JSON export

**v4.0.0** — Auto-resume · failed row retry · keep-alive · 3-layer duplicate detection · Category·City sheets

---

## ✦ Notes

- Keep the Google Maps tab **open** while extracting
- For 500+ result extractions, use a **custom limit** per keyword to avoid rate limiting
- Email is extracted only if it appears directly on the Maps listing page
- If you create a **New Deployment** in Apps Script, update the URL in the extension

---

## ✦ License

MIT — free to use, modify, and distribute.

---

<div align="center">

Built for lead generation, business research, and market intelligence.

**[⭐ Star this repo](https://github.com/sk-sazzad/MapHarvest)** · **[🐛 Report an issue](https://github.com/sk-sazzad/MapHarvest/issues)** · **[📥 Download latest](https://github.com/sk-sazzad/MapHarvest/releases/latest)**

</div>
