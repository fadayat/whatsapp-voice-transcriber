from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
FIXTURE = ROOT / "test" / "ui_fixture.html"


def install_chrome_mock(context):
    context.add_init_script(
        """
        globalThis.chrome = {
          runtime: {
            lastError: null,
            sendMessage(message, callback) {
              if (message.type === "GET_HEALTH") {
                callback({
                  ok: true,
                  data: {
                    configured: true,
                    provider: "groq",
                    model: "whisper-large-v3",
                    language: "auto",
                    storage: "keychain"
                  }
                });
                return;
              }
              callback({ ok: true, data: { text: "Salam, sabah saat onda g\u00f6r\u00fc\u015f\u0259k." } });
            }
          }
        };
        """
    )


def main():
    console_errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 900, "height": 620})
        install_chrome_mock(context)

        page = context.new_page()
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.goto(FIXTURE.as_uri())
        page.wait_for_load_state("networkidle")
        page.add_style_tag(path=str(EXTENSION / "content.css"))
        page.add_script_tag(path=str(EXTENSION / "page-hook.js"))
        page.add_script_tag(path=str(EXTENSION / "core.js"))
        page.add_script_tag(path=str(EXTENSION / "content.js"))

        action = page.locator(".wat-action")
        action.first.wait_for()
        assert action.count() == 2
        assert page.get_by_role("button", name="Transcribe voice note").count() == 2
        assert page.locator('[data-testid="msg-container"] > .message > .wat-mount').count() == 1
        assert page.locator('[data-id="message-voice-az"] > .wat-mount').count() == 0
        action.first.click()
        transcript = page.locator(".wat-transcript")
        transcript.wait_for()
        assert transcript.inner_text() == "Salam, sabah saat onda g\u00f6r\u00fc\u015f\u0259k."
        assert page.locator(".wat-panel-label").first.inner_text() == "Transcript"
        assert page.locator(".wat-action").first.is_hidden()
        assert page.get_by_role("button", name="Refresh transcript").count() == 1
        action.nth(1).click()
        page.locator(".wat-transcript").nth(1).wait_for()
        assert page.locator(".wat-transcript").nth(1).inner_text() == "Salam, sabah saat onda g\u00f6r\u00fc\u015f\u0259k."
        assert page.evaluate("window.__watPlayEvents") == 0
        assert page.evaluate("window.__watLastDetachedMedia.paused") is True
        assert page.evaluate("window.__watLastDetachedMedia.currentTime") == 0
        assert page.locator('[data-testid="msg-container"] .wat-mount').evaluate(
            "node => node.getBoundingClientRect().width"
        ) < 300
        panel_box = page.locator('[data-testid="msg-container"] .wat-panel').bounding_box()
        time_box = page.locator('[data-testid="msg-container"] time').bounding_box()
        assert panel_box is not None and time_box is not None
        assert time_box["y"] >= panel_box["y"] + panel_box["height"]
        page.screenshot(path="/tmp/whatsapp-transcriber-fixture.png", full_page=True)

        page.evaluate("document.body.classList.add('dark')")
        page.emulate_media(color_scheme="dark")
        page.screenshot(path="/tmp/whatsapp-transcriber-fixture-dark.png", full_page=True)

        page.locator('[data-id="message-voice-1"] .audio-row').evaluate("node => node.remove()")
        page.locator('[data-id="message-voice-1"]:not([data-wa-transcriber])').wait_for()
        assert page.locator('[data-id="message-voice-1"] .wat-mount').count() == 0

        popup = context.new_page()
        popup.set_viewport_size({"width": 360, "height": 460})
        popup.goto((EXTENSION / "popup.html").as_uri())
        popup.wait_for_load_state("networkidle")
        popup.get_by_text("Ready to transcribe").wait_for()
        popup.screenshot(path="/tmp/whatsapp-transcriber-popup.png", full_page=True)

        assert not console_errors, f"Browser console errors: {console_errors}"
        browser.close()

    print("UI fixture and popup passed")
    print("/tmp/whatsapp-transcriber-fixture.png")
    print("/tmp/whatsapp-transcriber-popup.png")


if __name__ == "__main__":
    main()
