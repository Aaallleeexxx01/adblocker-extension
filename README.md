# adblocker-extension
Chrome MV3 ad blocker – thesis project
## Features
-  Network-level ad blocking using declarativeNetReques (260 rules)
-  Popup UI with enable/disable toggle and live blocked ads counter
-  Per-site whitelist
-  Cosmetic filtering to hide leftover ad containers
-  JavaScript popup blocking

 ## How to install
1. Clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable Developer Mode
4. Click "Load unpacked" → select this folder

## Tech stack
- Vanilla JavaScript, HTML, CSS
- Chrome Extensions Manifest V3
- `declarativeNetRequest` API for network blocking
- `MutationObserver` for cosmetic filtering

## Project structure
adblocker/
├── manifest.json          # Extension config
├── background/
│   └── service-worker.js  # State, counter, whitelist logic
├── content/
│   └── content-script.js  # Cosmetic filtering + popup blocking
├── popup/
│   ├── popup.html         # UI
│   ├── popup.js           # UI logic
│   └── popup.css          # Styling
├── rules/
│   └── rules.json         # 260 blocking rules
└── icons/