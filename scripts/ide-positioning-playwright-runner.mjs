const baseUrl = process.env.IDE_POSITIONING_URL;

if (!baseUrl) {
  throw new Error("IDE_POSITIONING_URL is required");
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ timeout: 10000 });

try {
  const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(`console:${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(`pageerror:${error.message}`);
  });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const editor = page.getByLabel("Edit smoke.ts");
  try {
    await editor.waitFor({ state: "attached" });
  } catch (error) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const rootHtml = await page.locator("#root").evaluate((root) => root.innerHTML.slice(0, 8000)).catch(() => "");
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}\nPage errors:\n${pageErrors.join("\n") || "(none)"}\nBody:\n${bodyText}\nRoot HTML:\n${rootHtml}`);
  }

  const clickPoint = await page.locator('[data-test-ide-code-text="1"]').evaluate((cell) => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    if (!(textNode instanceof Text)) {
      throw new Error("IDE smoke fixture did not render text node");
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    const rect = range.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error("IDE smoke fixture rendered empty word range");
    }

    return {
      x: rect.right - Math.max(1, rect.width / 16),
      y: rect.top + rect.height / 2
    };
  });

  await page.mouse.click(clickPoint.x, clickPoint.y);
  const selectionStart = await editor.evaluate((element) => element.selectionStart);
  if (selectionStart !== 4) {
    throw new Error(`Expected click at end of visual "word" to place caret at 4, got ${selectionStart}`);
  }

  await page.keyboard.press("s");
  await page.waitForFunction(() => document.querySelector('[data-test-ide-code-text="1"]')?.textContent === "words tail");
  const finalValue = await editor.evaluate((element) => element.value);
  if (finalValue !== "words tail") {
    throw new Error(`Expected textarea value "words tail", got "${finalValue}"`);
  }

  console.log("browser check passed");
} finally {
  await browser.close().catch(() => undefined);
}
