#!/usr/bin/env python3
"""Phase 3 visual proof (Gate 3).

Prereqs: server on :4000 (real LLM configured), client preview on
:4173 (`cd client && npx vite preview --port 4173 --host 0.0.0.0`).

Flow:
  1. Open the real UI FIRST and wait for LIVE_MODE (so no orchestrator
     event is missed), and confirm the TopBar shows the real server
     token total (proves REST + CORS work from the browser).
  2. Submit a real goal via POST /api/run.
  3. When a subtask is running, screenshot the world: an agent at work
     with a REAL thought bubble from the orchestrator
     -> screenshots/phase3-working.png
  4. After the goal completes, open the Inspector for the agent who
     produced an artifact and expand it
     -> screenshots/phase3-artifact-inspector.png

Run with the Playwright venv python:
  ~/workspace/x-automation/venv/bin/python scripts/screenshot-phase3.py
"""
import json
import time
import urllib.request

from playwright.sync_api import sync_playwright

API = "http://localhost:4000"
UI = "http://localhost:4173"
OUT_DIR = "/home/hatch/workspace/ai-agent-living-world/screenshots"
NAMES = {
    "agent-manager-1": "Nova",
    "agent-programmer-1": "Kai",
    "agent-programmer-2": "Rin",
    "agent-designer-1": "Mika",
    "agent-researcher-1": "Sora",
    "agent-qa-1": "Bimo",
}


def api(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode())


def main():
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
        page.wait_for_timeout(6000)  # let stats fetch land in the TopBar
        topbar = page.locator("text=API cost").first.inner_text()
        print(f"topbar after load: {topbar!r}")

        goal = api(
            "/api/run",
            "POST",
            {
                "prompt": "Tulis satu caption Instagram yang hangat untuk kedai kopi kecil, plus dua ide hashtag.",
            },
        )
        goal_id = goal["id"]
        print(f"goal submitted: {goal_id}")

        # Wait until a subtask is running; the typing state (with the
        # real thought bubble) lasts for the whole LLM call.
        deadline = time.time() + 240
        working_agent = None
        while time.time() < deadline:
            tasks = api("/api/tasks")
            running = [
                t
                for t in tasks
                if t["parentTaskId"] == goal_id and t["status"] == "running"
            ]
            if running:
                working_agent = running[0]["assignedAgentId"]
                break
            time.sleep(2)
        print(f"working agent: {working_agent} ({NAMES.get(working_agent or '')})")
        page.wait_for_timeout(4000)
        page.screenshot(path=f"{OUT_DIR}/phase3-working.png")
        print("saved phase3-working.png")

        # Wait for the goal to complete.
        deadline = time.time() + 300
        final = None
        while time.time() < deadline:
            final = api(f"/api/tasks/{goal_id}")
            if final["status"] in ("completed", "failed"):
                break
            time.sleep(3)
        print(f"goal final status: {final['status'] if final else 'unknown'}")

        tasks = api("/api/tasks")
        children = [
            t
            for t in tasks
            if t["parentTaskId"] == goal_id and t["status"] == "completed"
        ]
        if children:
            agent_id = children[0]["assignedAgentId"]
            name = NAMES[agent_id]
            page.locator(f'button:has-text("{name}")').first.click()
            page.wait_for_timeout(2000)
            md_buttons = page.locator('button:has-text(".md")')
            print(f"artifact buttons in inspector: {md_buttons.count()}")
            if md_buttons.count() > 0:
                md_buttons.first.click()
                page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT_DIR}/phase3-artifact-inspector.png")
        print("saved phase3-artifact-inspector.png")
        browser.close()


if __name__ == "__main__":
    main()
