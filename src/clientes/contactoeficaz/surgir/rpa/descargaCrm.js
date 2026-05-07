const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../../../../shared/config');
const { fechaHoyDDMMYYYY, log } = require('../../../../shared/util');

const REPORTE_URL =
  'http://45.137.192.162/contactoeficaz/cobranza/PQ004BACKOFFICE/ImpresionReporteBancos002.aspx';

async function setFechaAspx(page, selector, value) {
  const loc = page.locator(selector);
  await loc.click();
  await page.keyboard.press('Escape');
  await loc.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type(value, { delay: 40 });
  await page.keyboard.press('Tab');

  let actual = await loc.inputValue();
  if (actual !== value) {
    log(`  ${selector} no aceptó tipeo ("${actual}"), intento setter nativo`);
    await page.evaluate(
      ({ sel, val }) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        ).set;
        setter.call(el, val);
        ['input', 'change', 'blur'].forEach((ev) =>
          el.dispatchEvent(new Event(ev, { bubbles: true }))
        );
      },
      { sel: selector, val: value }
    );
    actual = await loc.inputValue();
  }

  if (actual !== value) {
    throw new Error(
      `No se pudo establecer ${selector}="${value}" (quedó: "${actual}")`
    );
  }
  log(`  ${selector} = "${actual}" OK`);
}

async function descargarReporte() {
  fs.mkdirSync(config.downloadDir, { recursive: true });

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    log('Login paso 1: enviando usuario y clave');
    await page.goto(config.crm.url, { waitUntil: 'domcontentloaded' });
    await page.fill('#usuario', config.crm.user);
    await page.fill('#clave', config.crm.pass);
    await page.click('#btn_login_usr');

    log('Login paso 2: esperando dropdown de perfil');
    await page.waitForSelector('#perfil', { timeout: 20000 });
    await page.fill('#usuario', config.crm.user);
    await page.fill('#clave', config.crm.pass);
    await page.selectOption('#perfil', { label: config.crm.perfil });
    await page.click('#btn_login_usr');
    await page.waitForLoadState('domcontentloaded');
    log('Login completado');

    log(`Navegando al reporte: ${REPORTE_URL}`);
    await page.goto(REPORTE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#slt_proveedor', { timeout: 20000 });

    const hoy = fechaHoyDDMMYYYY();
    log(`Proveedor=SURGIR (${config.surgir.proveedor})  Fecha=${hoy}`);

    await page.selectOption('#slt_proveedor', { value: config.surgir.proveedor });
    await page
      .waitForLoadState('networkidle', { timeout: 8000 })
      .catch(() => log('  (networkidle timeout tras proveedor, continuando)'));

    await setFechaAspx(page, '#txt_fecha_desde', hoy);
    await setFechaAspx(page, '#txt_fecha_hasta', hoy);

    const fDesde = await page.locator('#txt_fecha_desde').inputValue();
    const fHasta = await page.locator('#txt_fecha_hasta').inputValue();
    log(`Pre-Generar: fecha_desde="${fDesde}" fecha_hasta="${fHasta}"`);

    log('Click en Generar');
    await page.click('#btn_buscar');

    log('Esperando link de descarga en la grilla');
    const link = page.locator('a[href*="descargar_reporte_bancos.aspx"]').first();
    await link.waitFor({ state: 'visible', timeout: 45000 });

    const href = await link.getAttribute('href');
    const absoluteUrl = new URL(href, page.url()).toString();
    log(`Link de descarga: ${absoluteUrl}`);

    log('Descargando archivo con la sesión autenticada');
    const resp = await context.request.get(absoluteUrl);
    if (!resp.ok()) {
      throw new Error(`Descarga fallida: HTTP ${resp.status()} ${resp.statusText()}`);
    }
    const buf = await resp.body();
    if (buf.length === 0) {
      throw new Error('El servidor devolvió un archivo vacío');
    }

    const fechaCompacta = hoy.replaceAll('/', '');
    const cd = resp.headers()['content-disposition'] || '';
    const m = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    const filename = m
      ? decodeURIComponent(m[1].trim())
      : `reporte_bancos_surgir_${fechaCompacta}.txt`;

    const outPath = path.join(config.downloadDir, filename);
    fs.writeFileSync(outPath, buf);
    log(`OK  ${outPath}  (${buf.length} bytes)`);

    const successShot = path.join(
      config.downloadDir,
      `surgir_descarga_success_${Date.now()}.png`
    );
    try {
      await page.screenshot({ path: successShot, fullPage: true });
      log(`Screenshot descarga OK: ${successShot}`);
    } catch (_) {}

    return outPath;
  } catch (err) {
    const shot = path.join(config.downloadDir, `surgir_error_descarga_${Date.now()}.png`);
    try {
      await page.screenshot({ path: shot, fullPage: true });
      log(`Screenshot de error: ${shot}`);
    } catch (_) {}
    throw err;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  descargarReporte()
    .then((p) => {
      process.stdout.write(`${p}\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`ERROR: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { descargarReporte };
