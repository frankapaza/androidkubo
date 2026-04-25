const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../../../../shared/config');
const { log } = require('../../../../shared/util');

async function subirArchivo(archivoPath) {
  if (!archivoPath) {
    throw new Error('Falta ruta del archivo a subir');
  }
  if (!fs.existsSync(archivoPath)) {
    throw new Error(`No existe el archivo: ${archivoPath}`);
  }

  const stats = fs.statSync(archivoPath);
  log(`Archivo: ${archivoPath} (${stats.size} bytes)`);

  const browser = await chromium.launch({ headless: config.headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    log('Login Mibanco');
    await page.goto(config.mibanco.url, { waitUntil: 'domcontentloaded' });
    await page.fill('#form_username', config.mibanco.user);
    await page.fill('#form_password', config.mibanco.pass);
    await page.click('#submit_button');

    log('Esperando landing (botón uploadButton)');
    await page.waitForSelector('#uploadButton', {
      state: 'visible',
      timeout: 30000,
    });
    // Deja que React monte handlers y terminen XHRs del dashboard
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    log('Login OK');

    log('Abriendo modal de carga');
    const modal = page.locator('.react-file-uploader-modal');
    let modalAbierto = false;
    for (let intento = 1; intento <= 3 && !modalAbierto; intento++) {
      await page.locator('#uploadButton').click();
      try {
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        modalAbierto = true;
      } catch (_) {
        if (intento < 3) {
          log(`  Modal no abrió en intento ${intento}, reintentando`);
          await page.waitForTimeout(1500);
        }
      }
    }
    if (!modalAbierto) {
      throw new Error('Modal de upload no se abrió tras 3 intentos');
    }

    const folderValue = await modal
      .locator('input.wizard-upload-folder')
      .inputValue();
    log(`Carpeta destino "Cargar en": "${folderValue}"`);

    log(`Llenando Notas: "${config.mibanco.notas}"`);
    await modal
      .locator('textarea.wizard-notes-input')
      .fill(config.mibanco.notas);

    log('Adjuntando archivo');
    await modal
      .locator('input.file-selector-input:not([webkitdirectory])')
      .setInputFiles(archivoPath);

    log('Esperando que el botón Cargar se habilite');
    const cargarEnabled = modal.locator(
      'button[data-testid="modal-footer-button-primary"]:not([disabled])'
    );
    await cargarEnabled.waitFor({ state: 'visible', timeout: 30000 });

    const preShot = path.join(
      config.downloadDir,
      `mibanco_pre_click_${Date.now()}.png`
    );
    await page.screenshot({ path: preShot, fullPage: true });
    log(`Screenshot pre-click: ${preShot}`);

    if (config.dryRun) {
      log('DRY_RUN=true -> NO se clickea Cargar. Flujo validado hasta aquí.');
      return { dryRun: true, screenshot: preShot, folderDestino: folderValue };
    }

    log('Click en Cargar (subida real)');
    await cargarEnabled.click();

    log('Esperando que la subida termine (botón principal cambia a "Cerrar")');
    const cerrarBtn = modal.locator(
      'button[data-testid="modal-footer-button-primary"]:has-text("Cerrar")'
    );
    await cerrarBtn.waitFor({ state: 'visible', timeout: 180000 });
    log('Subida completada (✓ Success detectado)');

    const successShot = path.join(
      config.downloadDir,
      `mibanco_success_${Date.now()}.png`
    );
    await page.screenshot({ path: successShot, fullPage: true });
    log(`Screenshot de éxito: ${successShot}`);

    log('Click en Cerrar para dismiss del modal');
    await cerrarBtn.click();

    log('Esperando cierre del modal');
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.react-file-uploader-modal.show').length ===
        0,
      null,
      { timeout: 15000 }
    );

    const postShot = path.join(
      config.downloadDir,
      `mibanco_post_click_${Date.now()}.png`
    );
    await page.screenshot({ path: postShot, fullPage: true });
    log(`Screenshot post-subida: ${postShot}`);
    log('Subida completada (modal cerrado)');

    return { dryRun: false, screenshot: postShot, folderDestino: folderValue };
  } catch (err) {
    const shot = path.join(
      config.downloadDir,
      `error_subida_${Date.now()}.png`
    );
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
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node src/clientes/contactoeficaz/mibanco/rpa/subidaMibanco.js <ruta_al_archivo>');
    process.exit(2);
  }
  subirArchivo(arg)
    .then((r) => {
      process.stdout.write(`${JSON.stringify(r)}\n`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`ERROR: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { subirArchivo };
