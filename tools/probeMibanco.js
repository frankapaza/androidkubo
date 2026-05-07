const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../src/shared/config');
const { log } = require('../src/shared/util');

(async () => {
  fs.mkdirSync(config.downloadDir, { recursive: true });
  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const dump = {
    url: null,
    title: null,
    headings: [],
    buttons: [],
    links: [],
    inputs: [],
    iframes: [],
    visibleText: null,
  };

  try {
    log(`Navegando: ${config.mibanco.url}`);
    await page.goto(config.mibanco.url, { waitUntil: 'domcontentloaded' });

    // Detecta si la página de login (form_username) está presente
    const tieneLogin = await page
      .locator('#form_username')
      .first()
      .isVisible()
      .catch(() => false);

    if (tieneLogin) {
      log('Pantalla de login detectada — enviando credenciales');
      await page.fill('#form_username', config.mibanco.user);
      await page.fill('#form_password', config.mibanco.pass);
      await page.click('#submit_button');
    } else {
      log('NO se detectó #form_username — puede ser otro tipo de login');
    }

    // Espera a que la landing termine de pintar
    await page
      .waitForLoadState('networkidle', { timeout: 15000 })
      .catch(() => log('  (networkidle timeout, continuando)'));
    await page.waitForTimeout(1500);

    const shot = path.join(
      config.downloadDir,
      `mibanco_probe_${Date.now()}.png`
    );
    await page.screenshot({ path: shot, fullPage: true });
    log(`Screenshot landing: ${shot}`);

    dump.url = page.url();
    dump.title = await page.title();

    dump.headings = await page.$$eval('h1, h2, h3', (els) =>
      els.map((e) => `${e.tagName}: ${e.innerText.trim()}`).filter(Boolean)
    );

    dump.buttons = await page.$$eval(
      'button, [role="button"], input[type="button"], input[type="submit"]',
      (els) =>
        els
          .map((e) => ({
            tag: e.tagName,
            id: e.id || null,
            cls: e.className || null,
            text: (e.innerText || e.value || '').trim().slice(0, 80),
            testid: e.getAttribute('data-testid') || null,
            visible:
              !!e.offsetParent || getComputedStyle(e).position === 'fixed',
          }))
          .filter((b) => b.visible)
    );

    dump.links = await page.$$eval('a', (els) =>
      els
        .map((e) => ({
          href: e.getAttribute('href'),
          text: e.innerText.trim().slice(0, 80),
          id: e.id || null,
        }))
        .filter((l) => l.text && l.href)
        .slice(0, 30)
    );

    dump.inputs = await page.$$eval('input, textarea, select', (els) =>
      els.map((e) => ({
        tag: e.tagName,
        type: e.type || null,
        id: e.id || null,
        name: e.name || null,
        cls: e.className || null,
        placeholder: e.placeholder || null,
      }))
    );

    dump.iframes = await page.$$eval('iframe', (els) =>
      els.map((e) => ({ id: e.id, src: e.src }))
    );

    dump.visibleText = (await page.locator('body').innerText())
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);

    const dumpPath = path.join(
      config.downloadDir,
      `mibanco_probe_${Date.now()}.json`
    );
    fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 2));
    log(`Dump DOM: ${dumpPath}`);

    process.stdout.write(JSON.stringify(dump, null, 2) + '\n');
  } catch (err) {
    const shot = path.join(
      config.downloadDir,
      `mibanco_probe_error_${Date.now()}.png`
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
