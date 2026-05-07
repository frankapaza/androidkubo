const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../src/shared/config');
const { log } = require('../src/shared/util');

async function snapshot(page, label) {
  const data = {
    label,
    url: page.url(),
    fileInputs: await page.$$eval('input[type="file"]', (els) =>
      els.map((e) => ({
        id: e.id || null,
        name: e.name || null,
        cls: e.className || null,
        accept: e.accept || null,
        multiple: e.multiple || false,
        webkitdirectory: e.hasAttribute('webkitdirectory'),
        visible: !!e.offsetParent,
      }))
    ),
    buttons: await page.$$eval(
      'button, [role="button"], input[type="button"], input[type="submit"]',
      (els) =>
        els
          .map((e) => ({
            id: e.id || null,
            cls: e.className || null,
            text: (e.innerText || e.value || '').trim().slice(0, 80),
            testid: e.getAttribute('data-testid') || null,
            visible: !!e.offsetParent,
          }))
          .filter((b) => b.visible)
    ),
    visibleModalsOrDialogs: await page.$$eval(
      '.modal, [role="dialog"], .react-file-uploader-modal, .wizard, [class*="upload"]',
      (els) =>
        els
          .map((e) => ({
            tag: e.tagName,
            id: e.id || null,
            cls: e.className,
            visible: !!e.offsetParent,
            innerHTMLpreview: e.innerHTML.slice(0, 300),
          }))
          .filter((m) => m.visible)
    ),
    textareas: await page.$$eval('textarea', (els) =>
      els.map((e) => ({
        id: e.id || null,
        name: e.name || null,
        cls: e.className,
        placeholder: e.placeholder || null,
      }))
    ),
    visibleText: (await page.locator('body').innerText())
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500),
  };
  return data;
}

(async () => {
  fs.mkdirSync(config.downloadDir, { recursive: true });
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const result = { stages: [] };

  try {
    log(`Navegando: ${config.mibanco.url}`);
    await page.goto(config.mibanco.url, { waitUntil: 'domcontentloaded' });

    log('Login');
    await page.fill('#form_username', config.mibanco.user);
    await page.fill('#form_password', config.mibanco.pass);
    await page.click('#submit_button');

    await page
      .waitForLoadState('networkidle', { timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1500);

    log('Snapshot pre-click');
    result.stages.push(await snapshot(page, 'pre_click'));

    const shot1 = path.join(
      config.downloadDir,
      `mibanco_upload_pre_${Date.now()}.png`
    );
    await page.screenshot({ path: shot1, fullPage: true });
    log(`Screenshot pre: ${shot1}`);

    log('Click en #fileUploaderButton');
    await page.click('#fileUploaderButton');
    await page.waitForTimeout(2000);

    log('Snapshot post-click');
    result.stages.push(await snapshot(page, 'post_click'));

    const shot2 = path.join(
      config.downloadDir,
      `mibanco_upload_post_${Date.now()}.png`
    );
    await page.screenshot({ path: shot2, fullPage: true });
    log(`Screenshot post: ${shot2}`);

    const dumpPath = path.join(
      config.downloadDir,
      `mibanco_upload_probe_${Date.now()}.json`
    );
    fs.writeFileSync(dumpPath, JSON.stringify(result, null, 2));
    log(`Dump: ${dumpPath}`);

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    const shot = path.join(
      config.downloadDir,
      `mibanco_upload_probe_error_${Date.now()}.png`
    );
    try {
      await page.screenshot({ path: shot, fullPage: true });
    } catch (_) {}
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
