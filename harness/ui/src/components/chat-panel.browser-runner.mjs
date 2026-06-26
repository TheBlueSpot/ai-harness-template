const baseUrl = process.env.CHAT_PANEL_BROWSER_URL;

if (!baseUrl) {
  throw new Error("CHAT_PANEL_BROWSER_URL is required");
}

const { chromium } = await import("playwright");
const browser = await chromium.launch({ timeout: 10000 });

try {
  const page = await browser.newPage({ viewport: { width: 1040, height: 760 } });
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

  try {
    await waitForFixtureLayout(page);
    assertProjectChatSnapshot(await readProjectChatSnapshot(page, "Project chat browser message 159"), "project chat first paint");

    await page.locator('[data-test-chat-pane-tab="plan"]').click();
    await page.locator('[data-test-chat-pane-tab="chat"]').click();
    await waitForAnimationFrames(page, 2);
    assertProjectChatSnapshot(await readProjectChatSnapshot(page, "Project chat browser message 159"), "project chat tab remount");
  } catch (error) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const rootHtml = await page.locator("#root").evaluate((root) => root.innerHTML.slice(0, 8000)).catch(() => "");
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}\nPage errors:\n${pageErrors.join("\n") || "(none)"}\nBody:\n${bodyText}\nRoot HTML:\n${rootHtml}`);
  }

  console.log("browser project chat first-load check passed");
} finally {
  await browser.close().catch(() => undefined);
}

async function waitForFixtureLayout(page) {
  await page.locator('[data-test-fixture-ready="1"]').waitFor({ state: "attached" });
  await waitForAnimationFrames(page, 3);
}

async function waitForAnimationFrames(page, count) {
  await page.evaluate(
    (frameCount) =>
      new Promise((resolve) => {
        let remaining = frameCount;
        const step = () => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count
  );
}

async function readProjectChatSnapshot(page, targetText) {
  return page.evaluate((targetText) => {
    const viewport = document.querySelector('[data-test-virtual-list="project-chat-transcript"]');
    if (!viewport) {
      return {
        missing: true,
        viewportHeight: 0,
        canvasHeight: 0,
        visibleCount: 0,
        overlapCount: 0,
        zeroHeightRows: 0,
        targetVisible: false,
        scrollTop: 0,
        scrollHeight: 0
      };
    }

    const viewportRect = viewport.getBoundingClientRect();
    const canvas = viewport.firstElementChild;
    const canvasRect = canvas?.getBoundingClientRect();
    const rows = Array.from(viewport.querySelectorAll("[data-test-virtual-list-item]")).map((row) => {
      const rect = row.getBoundingClientRect();
      const text = row.textContent ?? "";
      return {
        text,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        visible: rect.bottom > viewportRect.top + 1 && rect.top < viewportRect.bottom - 1
      };
    });
    const visibleRows = rows.filter((row) => row.visible);
    const overlapCount = visibleRows.filter((row, index) => {
      const next = visibleRows[index + 1];
      return next ? next.top < row.bottom - 1 : false;
    }).length;
    const target = rows.find((row) => row.text.includes(targetText));

    return {
      missing: false,
      viewportHeight: viewportRect.height,
      canvasHeight: canvasRect?.height ?? 0,
      visibleCount: visibleRows.length,
      overlapCount,
      zeroHeightRows: rows.filter((row) => row.height <= 0).length,
      targetVisible: target?.visible ?? false,
      scrollTop: viewport.scrollTop,
      scrollHeight: viewport.scrollHeight
    };
  }, targetText);
}

function assertProjectChatSnapshot(snapshot, label) {
  const failures = [];
  if (snapshot.missing) {
    failures.push("missing viewport");
  }
  if (!(snapshot.viewportHeight > 300)) {
    failures.push(`viewport height ${snapshot.viewportHeight}`);
  }
  if (!(snapshot.canvasHeight > snapshot.viewportHeight)) {
    failures.push(`canvas height ${snapshot.canvasHeight} <= viewport ${snapshot.viewportHeight}`);
  }
  if (!(snapshot.visibleCount >= 2)) {
    failures.push(`visible rows ${snapshot.visibleCount}`);
  }
  if (snapshot.zeroHeightRows !== 0) {
    failures.push(`zero-height rows ${snapshot.zeroHeightRows}`);
  }
  if (snapshot.overlapCount !== 0) {
    failures.push(`overlap count ${snapshot.overlapCount}`);
  }
  if (!snapshot.targetVisible) {
    failures.push("latest message not visible");
  }
  if (failures.length > 0) {
    throw new Error(`${label} failed: ${failures.join("; ")}\n${JSON.stringify(snapshot, null, 2)}`);
  }
}
