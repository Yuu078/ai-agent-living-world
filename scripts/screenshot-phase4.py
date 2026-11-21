#!/usr/bin/env python3
"""Phase 4 visual proof (Gate 4).

Prereqs: Phase 4 server on :4000, client preview on :4173 serving the
Phase 4 build (`cd client && npx vite preview --port 4173 --host 0.0.0.0`).

Flow:
  1. Place a desk in the main corridor via REST BEFORE opening the UI
     (cells (16,16)-(17,16) — the Gate 4 grid test proves agents detour
     around exactly this footprint).
  2. Open the UI: the desk must be there after a fresh page load
     (= persistence proof) -> screenshots/phase4-desk-placed.png
  3. Open Build Mode, arm the Desk tool -> phase4-buildmode.png
  4. Switch to Floor 2 (Executive & R&D Lab) -> phase4-floor2.png
  5. Back on Floor 1, enable the guest Crowd -> phase4-crowd.png
  6. Delete the desk again via REST (world back to seeds only).

Run with the Playwright venv python:
  ~/workspace/x-automation/venv/bin/python scripts/screenshot-phase4.py
"""
import json
import urllib.request

from playwright.sync_api import sync_playwright

API = "http://localhost:4000"
UI = "http://localhost:4173"
OUT_DIR = "/home/hatch/workspace/ai-agent-living-world/screenshots"

DESK = {
    "id": "screenshot-desk",
    "type": "desk",
    "room": "open_office",
    "posX": 16,
    "posY": 0,
    "posZ": 16,
    "rotY": 0,
    "metadata": {
        "userPlaced": True,
        "floor": 1,
        "furnitureType": "desk",
        "rotation": 0,
        "footprint": {"x0": 16, "z0": 16, "x1": 17, "z1": 16},
    },
}


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"} if body is not None else {}
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read().decode()
        return json.loads(raw) if raw else {}


def click_text(page, text):
    """Click the first button whose text contains `text`, via DOM
    dispatch (Playwright's actionability waits hang on this WebGL page)."""
    ok = page.evaluate(
        """(text) => {
          const b = [...document.querySelectorAll('button')]
            .find((x) => x.textContent && x.textContent.includes(text));
          if (!b) return false;
          b.click();
          return true;
        }""",
        text,
    )
    print(f"click {text!r}: {'ok' if ok else 'NOT FOUND'}")
    return ok


def main():
    print("placing corridor desk via REST…")
    print(api("/api/world", "POST", {"objects": [DESK]}))

    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=[
                "--use-gl=swiftshader",
                "--enable-unsafe-swiftshader",
                "--no-sandbox",
            ]
        )
        page = browser.new_page(viewport={"width": 1600, "height": 950})
        page.goto(UI, wait_until="networkidle")
        page.get_by_text("LIVE_MODE").wait_for(timeout=30_000)
        page.wait_for_timeout(5000)

        # The desk placed via REST before page load must be visible now.
        page.screenshot(path=f"{OUT_DIR}/phase4-desk-placed.png")
        print("saved phase4-desk-placed.png")

        # Build Mode UI.
        click_text(page, "Build Mode")
        page.wait_for_timeout(1200)
        click_text(page, "Desk")
        page.wait_for_timeout(800)
        page.screenshot(path=f"{OUT_DIR}/phase4-buildmode.png")
        print("saved phase4-buildmode.png")

        # Floor 2 via the Build Panel F2 toggle.
        click_text(page, "F2")
        page.wait_for_timeout(3500)  # camera lerp + floor fade
        page.screenshot(path=f"{OUT_DIR}/phase4-floor2.png")
        print("saved phase4-floor2.png")

        # Back to Floor 1, close Build Mode, enable the crowd.
        click_text(page, "F1")
        page.wait_for_timeout(1500)
        page.evaluate(
            "() => { const b = document.querySelector('button[aria-label=\"Back\"]'); if (b) b.click(); }"
        )
        page.wait_for_timeout(800)
        click_text(page, "Crowd")
        page.wait_for_timeout(6000)  # guests spawn + start wandering
        page.screenshot(path=f"{OUT_DIR}/phase4-crowd.png")
        print("saved phase4-crowd.png")

        browser.close()

    print("cleaning up screenshot desk…")
    print(api("/api/world/screenshot-desk", "DELETE"))
    world = api("/api/world")
    ids = [o["id"] for o in world["objects"]]
    print(f"world objects after cleanup: {len(ids)} (screenshot-desk present: {'screenshot-desk' in ids})")


if __name__ == "__main__":
    main()
