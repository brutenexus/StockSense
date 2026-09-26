# StockSense — Hackathon Video

**Length:** 90 seconds · **Aspect:** 16:9 · **Captions:** burn in — many judges watch muted.

## The idea: "Follow one box"

Instead of a feature tour, the video follows a **single product** — the *Standing Desk Pro* —
from *"7 units left" + a low-stock alert* through a validated receipt that changes the number,
clears the alert, and unblocks a delivery that was **Waiting**. One storyline, one number
changing on screen, and the ledger proving why it changed. The tagline pays it off:
**"Every number has a story — StockSense keeps it."**

Why this works: hackathon judges see 50 feature montages. A single narrative thread with a
visible state change (alert → cleared, Waiting → Ready) demonstrates the workflow engine and
the ledger without ever saying "state machine" out loud.

## Script (90s)

| # | Time | On screen | Voice-over |
|---|------|-----------|------------|
| 1 | 0:00–0:08 | Title card: **StockSense** on slate background, green accent line draws in | "Warehouses run on one number: how much stock you have. When that number is wrong, everything after it is wrong too." |
| 2 | 0:08–0:18 | Dashboard; camera-zoom onto the low-stock KPI tile (7) | "This is StockSense. Right now, seven products are running low — and the system already knows." |
| 3 | 0:18–0:30 | Click into **Standing Desk Pro**; highlight the balance + "Update stock" button | "Here's a desk with seven units left. But we don't edit that number — that's how spreadsheets lie. Instead, we book a receipt." |
| 4 | 0:30–0:42 | New receipt form → save → status chip flips **Draft → Ready** | "A receipt document: three units in. It starts as a draft, gets confirmed to Ready…" |
| 5 | 0:42–0:52 | Manager clicks **Validate**; chip flips **Ready → Done**; page shows `WH/IN/0013 · 3 moves posted` | "…and when a manager validates it, stock actually moves. Three moves hit the ledger, timestamped and signed." |
| 6 | 0:52–1:04 | Back on product page: balance **7 → 10**; sidebar badge drops **7 → 6** | "The balance updated, the low-stock alert cleared — not because someone edited it, because the ledger says so." |
| 7 | 1:04–1:16 | Operations → Deliveries: the **Waiting** chip flips to **Ready** after validating an adjustment | "And when stock arrives, a delivery that was waiting gets unblocked automatically. That's a real workflow engine, not a status label." |
| 8 | 1:16–1:24 | Quick montage: stock-moves ledger → CSV download → activity feed → dark mode toggle | "Full move history, one-click CSV export, an audit trail of every action — in light or dark." |
| 9 | 1:24–1:30 | End card: "StockSense — Trust every number. Ship every order." + demo creds `manager / Manage@123` | "StockSense. Every number has a story — StockSense keeps it." |

## Shot list / production checklist

- Record at **1920×1080**, browser zoom **125%**, dark theme off (light reads better on projectors).
- Use a clean demo DB: **Settings → Data tools → Restore demo data** before recording.
- Pre-create the *Waiting* delivery before take 7 so the unblock lands on camera.
- Slow, deliberate clicks; 0.3s pause after each status-chip flip so the caption can land.
- Add subtle zoom (screen-studio style or manual keyframes) on: KPI tile, status chips, ledger row.
- Background music: low-key tech beat, ducked −12 dB under VO. No lyrics.
- Burn captions in **Source Sans 3** (matches the app), green highlight for the changing numbers.
- Export H.264, ≤ 60 MB for upload forms; keep a ProRes master for the live presentation.

## 30-second backup cut (if the slot is tight)

Keep only beats 1, 5, 6, 9 — receipt validated, number changes, alert clears, tagline.
