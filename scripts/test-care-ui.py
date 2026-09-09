"""Local demo browser workflow; production authorization is tested separately in PostgreSQL."""
import os
import uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = os.environ.get("CARE_UI_URL", "http://localhost:3012")
url = urlparse(base)
assert url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1"), "Local demo only"
output = Path("artifacts/care-workflow")
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    launch = {"headless": True}
    if os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
        launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
    browser = p.chromium.launch(**launch)
    try:
        for width in (390, 1280):
            print(f"Starting {width}", flush=True)
            nurse = browser.new_context(viewport={"width": width, "height": 900})
            family = browser.new_context(viewport={"width": width, "height": 900})
            for context, role in ((nurse, "nurse"), (family, "family")):
                context.add_cookies([{"name": "tka-role", "value": role, "domain": url.hostname, "path": "/"}])
            assert nurse.request.get(base + "/api/health/ready").json()["mode"] == "demo"
            errors = []
            np = nurse.new_page()
            fp = family.new_page()
            np.on("pageerror", lambda error: errors.append(str(error)))
            fp.on("pageerror", lambda error: errors.append(str(error)))
            np.goto(base + "/nurse", timeout=90000)
            np.wait_for_load_state("networkidle")
            np.get_by_role("button", name="指导", exact=True).click()
            text = "本地流程验证 " + str(uuid.uuid4())[:8]
            np.locator("textarea").fill(text)
            with np.expect_response(lambda r: r.request.method == "POST" and r.url.endswith("/api/nursing-records")) as saved:
                np.get_by_role("button", name="发起指导并记录", exact=True).click()
            assert saved.value.ok
            print("Guidance sent", flush=True)
            sent_records = nurse.request.get(base + "/api/dashboard").json()["nursingRecords"]
            record_id = next(r for r in sent_records if r["guidance"] == text)["id"]
            print("Opening family guidance", flush=True)
            fp.goto(base + "/family/guidance", timeout=90000)
            fp.wait_for_load_state("networkidle")
            expect(fp.get_by_text(text, exact=True)).to_be_visible(timeout=15000)
            card = fp.locator('[data-slot="card"]').filter(has=fp.get_by_text(text, exact=True))
            fp.route("**/api/nursing-records/*", lambda route: route.fulfill(status=503, json={"error": "Synthetic outage"}))
            card.get_by_role("button", name="标记为已读", exact=True).click()
            expect(fp.get_by_role("alert").filter(has_text="阅读确认未保存")).to_be_visible()
            expect(card.get_by_role("button", name="标记为已读", exact=True)).to_be_enabled()
            fp.unroute("**/api/nursing-records/*")
            with fp.expect_response(lambda r: r.request.method == "PATCH" and r.url.endswith(record_id)) as marked:
                card.get_by_role("button", name="标记为已读", exact=True).click()
            assert marked.value.ok
            expect(card.get_by_role("button", name="已确认阅读", exact=True)).to_be_disabled()
            records = nurse.request.get(base + "/api/dashboard").json()["nursingRecords"]
            assert next(r for r in records if r["id"] == record_id)["readAt"]
            fp.reload()
            expect(fp.locator('[data-slot="card"]').filter(has=fp.get_by_text(text, exact=True)).get_by_role("button", name="已确认阅读")).to_be_disabled()
            assert fp.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Family overflow: {width}"
            fp.screenshot(path=str(output / f"guidance-{width}.png"))
            fp.route("**/api/dashboard", lambda route: route.fulfill(status=503, json={"error": "Synthetic outage"}))
            fp.reload()
            expect(fp.get_by_role("alert").filter(has_text="暂时无法获取最新指导")).to_be_visible()
            expect(fp.get_by_text("指导尚未加载成功。", exact=True)).to_be_visible()
            expect(fp.get_by_text("暂无远程指导建议。", exact=False)).to_have_count(0)
            fp.unroute("**/api/dashboard")
            fp.get_by_role("button", name="重新获取指导", exact=True).click()
            expect(fp.get_by_text(text, exact=True)).to_be_visible()
            assert not errors, errors
            print(f"PASS {width}: nurse sends, family reads, receipt persists, load failure and recovery")
            nurse.close()
            family.close()
    finally:
        browser.close()
