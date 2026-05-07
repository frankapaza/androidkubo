const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../src/shared/config');
const { log } = require('../src/shared/util');

(async () => {
  fs.mkdirSync(config.downloadDir, { recursive: true });

  const tmpFile = path.join(config.downloadDir, '__probe_upload__.txt');
  fs.writeFileSync(tmpFile, 'archivo de prueba kubot\n');
  log(`Test file: ${tmpFile} (${fs.statSync(tmpFile).size} bytes)`);

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    log(`Goto ${config.mibanco.url}`);
    await page.goto(config.mibanco.url, { waitUntil: 'domcontentloaded' });

    log('Login');
    await page.fill('#form_username', config.mibanco.user);
    await page.fill('#form_password', config.mibanco.pass);
    await page.click('#submit_button');

    log('Esperando #fileUploaderButton');
    await page.waitForSelector('#fileUploaderButton', {
      state: 'visible',
      timeout: 30000,
    });
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    log('Click #fileUploaderButton');
    await page.click('#fileUploaderButton');

    log('Esperando textarea.wizard-notes-input (modal)');
    const notes = page.locator('textarea.wizard-notes-input');
    await notes.waitFor({ state: 'visible', timeout: 10000 });

    const folderInput = page.locator('input.wizard-upload-folder');
    const folderValue = await folderInput.inputValue();
    log(`Carpeta destino "Cargar en": "${folderValue}"`);

    log(`Notas: "${config.mibanco.notas}"`);
    await notes.fill(config.mibanco.notas);

    log('setInputFiles -> input.file-selector-input:not([webkitdirectory])');
    await page
      .locator('input.file-selector-input:not([webkitdirectory])')
      .setInputFiles(tmpFile);

    log('Esperando que el botón Cargar del modal se habilite');
    const submitBtn = page.locator(
      'button[data-testid="modal-footer-button-primary"]:not([disabled])'
    );
    await submitBtn.waitFor({ state: 'visible', timeout: 30000 });
    log('Botón Cargar habilitado OK');

    const shot = path.join(
      config.downloadDir,
      `mibanco_dryrun_ready_${Date.now()}.png`
    );
    await page.screenshot({ path: shot, fullPage: true });
    log(`Screenshot listo-para-cargar: ${shot}`);

    // Cancelar (no subir realmente)
    log('Click Cancelar (DRY_RUN)');
    await page
      .locator('button[data-testid="modal-footer-button-link"]')
      .click();
    await page.waitForTimeout(1000);

    log('OK — flujo validado hasta el click final');
    process.stdout.write(
      JSON.stringify({
        ok: true,
        folderDestino: folderValue,
        screenshot: shot,
      }) + '\n'
    );
  } catch (err) {
    const shot = path.join(
      config.downloadDir,
      `mibanco_dryrun_error_${Date.now()}.png`
    );
    try {
      await page.screenshot({ path: shot, fullPage: true });
    } catch (_) {}
    console.error(`ERROR: ${err.message}`);
    console.error(`Screenshot error: ${shot}`);
    process.exit(1);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {}
    await browser.close();
  }
})();
