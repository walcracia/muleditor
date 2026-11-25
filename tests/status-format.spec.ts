import { expect, test, type Page } from "@playwright/test";
import { downloadDocument } from "./helpers/immersive";

const documents = [
  { name: "status.md", format: "markdown", label: "MD", content: "# Format status\n\nKeep this document.\n" },
  { name: "status.html", format: "html", label: "HTML", content: "<!doctype html><html><body><h1>Format status</h1></body></html>\n" },
  { name: "status.xml", format: "xml", label: "XML", content: '<?xml version="1.0"?><root><item>format</item></root>\n' },
  { name: "status.yaml", format: "yaml", label: "YAML", content: "name: format-status\nenabled: true\n" },
  { name: "status.json", format: "json", label: "JSON", content: '{ "name": "format-status", "enabled": true }\n' },
  { name: "json.spdx.json", format: "spdx", label: "SPDX", content: '{ "spdxVersion": "SPDX-2.3", "SPDXID": "SPDXRef-DOCUMENT", "name": "format-status" }\n' },
  { name: "yaml.spdx.yaml", format: "spdx", label: "SPDX", content: "spdxVersion: SPDX-2.3\nSPDXID: SPDXRef-DOCUMENT\nname: format-status\n" },
  { name: "tag.spdx", format: "spdx", label: "SPDX", content: "SPDXVersion: SPDX-2.3\nSPDXID: SPDXRef-DOCUMENT\nDocumentName: format-status\n" }
] as const;

async function selectDocument(page: Page, name: string) {
  await page.locator(".tabs .tab").filter({ has: page.locator(".tabName", { hasText: name }) }).click();
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText(name);
}

async function expectFormat(page: Page, format: string, label: string) {
  const list = page.locator(".statusSupportedFormats");
  await expect(list.getByRole("listitem")).toHaveCount(6);
  const current = list.locator(".statusFormat[aria-current='true']");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("data-format", format);
  await expect(current).toHaveText(label);
  await expect(current).toHaveClass(/\bactive\b/);
  await expect(list.locator(`.statusFormat[aria-current]:not([data-format='${format}'])`)).toHaveCount(0);
  await expect(list.locator(".statusFormat.active")).toHaveCount(1);
  await expect(list.getByRole("button")).toHaveCount(0);
  await expect(page.locator(".statusBar")).not.toContainText(/Tauri|Browser|浏览器/);
}

test("status format follows the active document and groups all SPDX variants without changing content", async ({ page }) => {
  await page.goto("/");
  await expectFormat(page, "markdown", "MD");
  await page.locator("#fileInput").setInputFiles(documents.map(({ name, content }) => ({
    name, mimeType: "text/plain", buffer: Buffer.from(content)
  })));
  await expect(page.locator(".tabs .tab")).toHaveCount(documents.length);
  for (const document of documents) {
    await test.step(document.name, async () => {
      await selectDocument(page, document.name);
      await expectFormat(page, document.format, document.label);
      await expect(page.locator(".statusBar")).toContainText("已保存");
      expect((await downloadDocument(page)).toString("utf8")).toBe(document.content);
    });
  }
  await selectDocument(page, "status.json");
  // Format indicators describe the active document; clicking one is not a conversion command.
  await page.locator(".statusFormat[data-format='markdown']").click();
  await expectFormat(page, "json", "JSON");
  await expect(page.locator(".tabs .tab.active .tabName")).toHaveText("status.json");
  expect((await downloadDocument(page)).toString("utf8")).toBe(documents[4].content);
});

test("current format stays distinct and visible in both languages and desktop sizes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.locator("#fileInput").setInputFiles([documents[0], documents[4]].map(({ name, content }) => ({
    name, mimeType: "text/plain", buffer: Buffer.from(content)
  })));
  for (const locale of ["zh", "en"] as const) {
    if (locale === "en") await page.locator(".toolbar").getByRole("button", { name: "EN", exact: true }).click();
    for (const width of [1600, 1040]) {
      await page.setViewportSize({ width, height: width === 1040 ? 680 : 1000 });
      const document = width === 1600 ? documents[0] : documents[4];
      await selectDocument(page, document.name);
      await expectFormat(page, document.format, document.label);
      const chips = page.locator(".statusFormat");
      for (const chip of await chips.all()) {
        await expect(chip).toBeVisible();
        const box = await chip.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
      }
      const colors = await page.locator(".statusSupportedFormats").evaluate((list) => {
        const active = list.querySelector("[aria-current='true']")!;
        const inactive = list.querySelector(".statusFormat:not([aria-current])")!;
        return { active: getComputedStyle(active).backgroundColor, inactive: getComputedStyle(inactive).backgroundColor,
          weight: Number(getComputedStyle(active).fontWeight) };
      });
      expect(colors.active).not.toBe(colors.inactive);
      expect(colors.weight).toBeGreaterThanOrEqual(700);
      if (document.format === "json") {
        await expect(page.locator(".monaco-editor:visible .view-lines").first()).toContainText("format-status");
      }
      await page.screenshot({ path: testInfo.outputPath(`status-format-${locale}-${width}.png`) });
    }
  }
});
