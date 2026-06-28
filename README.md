# 🗺️ MapHarvest

> Extract business data from Google Maps and save it directly to Google Sheets — automatically.

![Version](https://img.shields.io/badge/version-5.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v2-green)
![Browser](https://img.shields.io/badge/browser-Chrome%20%7C%20Firefox-orange)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What is MapHarvest?

MapHarvest is a browser extension for Chrome and Firefox that automatically collects business information from Google Maps search results and sends it directly to your Google Sheet — with zero manual copy-pasting.

You enter a search keyword like **"coaching centers in rajshahi"**, press Start, and MapHarvest does the rest: scrolls through all results, opens each business profile, extracts the data, and saves it to your Sheet in real time.

---

## Features

- **Multi-keyword queue** — Add multiple keywords, MapHarvest extracts them one by one automatically
- **Smart duplicate detection** — 3-layer check (Profile Link → Name + Phone → Name + Address) so no business appears twice
- **Auto Category · City sheets** — Each category and city gets its own Sheet tab automatically (e.g. `Coaching Center · Rajshahi`)
- **Master sheet** — All extracted data also goes to a single `All Data` sheet
- **Auto-resume** — If your network drops or browser closes, extraction resumes from where it stopped
- **Failed row retry** — If a Sheet save fails, it queues the row and retries automatically
- **Export** — Download all extracted data as CSV or JSON anytime
- **Extraction history** — See every keyword you've run and how many records were saved
- **Works on Chrome and Firefox**

---

## Data Extracted

| Field | Description |
|-------|-------------|
| Name | Business name |
| Category | Type of business (from Maps profile) |
| Rating | Star rating (e.g. 4.6) |
| Reviews | Total review count |
| Phone | Phone number |
| Email | Email address (if listed) |
| Address | Full address |
| Website | Business website URL |
| Profile Link | Direct Google Maps link |
| Hours | Opening hours |
| Keyword | Search keyword used |
| Extracted At | Date and time of extraction |

---

## Installation

### Step 1 — Set up Google Sheet

1. Open a Google Sheet (new or existing)
2. Go to **Extensions → Apps Script**
3. Delete everything in the editor
4. Copy the contents of `GoogleAppsScript.gs` and paste it
5. Press **Ctrl+S** to save
6. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Access: **Anyone**
7. Click **Deploy** → Authorize → **Copy the Web App URL**

### Step 2 — Install the Extension

**Chrome:**
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `MapHarvest` folder

**Firefox:**
1. Go to `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on**
4. Select `manifest.json` from the `MapHarvest` folder

### Step 3 — Connect to Google Sheet

1. Click the MapHarvest icon in your browser toolbar
2. Paste the **Web App URL** from Step 1
3. Click **Test** — you should see "Connected ✓"

---

## How to Use

1. Open the extension popup
2. Enter one or more search keywords (one per line):
   ```
   coaching centers in rajshahi
   hospitals in dhaka
   restaurants in chittagong
   ```
3. Choose result limit: **All Results** or a **Custom** number per keyword
4. Click **▶ Start Extraction**

MapHarvest will open Google Maps, scroll through all results, extract each business profile, and save the data to your Sheet — keyword by keyword, automatically.

---

## Google Sheet Structure

```
All Data              ← Master sheet (every record from all keywords)
Coaching Center · Rajshahi   ← Auto-created per Category + City
Hospital · Dhaka             ← Auto-created
Restaurant · Chittagong      ← Auto-created
```

Category and city are detected from each business's own Maps profile. If the city can't be detected from the profile, it falls back to the keyword you entered.

---

## Duplicate Detection

MapHarvest checks for duplicates in 3 layers before saving any record:

1. **Profile Link** — Most accurate (every Maps listing has a unique URL)
2. **Name + Phone** — Catches same business with slightly different URLs
3. **Name + Address** — Backup when phone number is missing

If any layer matches, the record is skipped automatically.

---

## Auto-Resume

If your internet drops or you close the browser mid-extraction:

- Extraction pauses automatically
- When connection returns, it resumes from exactly where it stopped
- If the browser was closed, a **Resume** banner appears next time you open the extension

---

## File Structure

```
MapHarvest/
├── manifest.json          ← Extension configuration
├── popup.html             ← Extension popup UI
├── src/
│   ├── popup.js           ← Popup logic & multi-keyword queue
│   ├── content.js         ← Core extractor (runs inside Google Maps)
│   └── background.js      ← State management, keep-alive, retry queue
├── icons/                 ← Extension icons
└── GoogleAppsScript.gs    ← Paste this into your Google Sheet
```

---

## Requirements

- Chrome (any recent version) or Firefox
- A Google account with access to Google Sheets
- Google Apps Script Web App deployed (see Installation Step 1)

---

## Notes

- Keep the Google Maps tab open while extracting
- Email is extracted only if it appears directly on the Maps listing page
- For very large extractions (1000+), use a reasonable custom limit to avoid rate limiting from Google
- Each re-deployment of the Apps Script generates a new URL — update it in the extension if you redeploy

---

## License

MIT License — free to use, modify, and distribute.

---

<p align="center">Built with ❤️ for lead generation and business research</p>
