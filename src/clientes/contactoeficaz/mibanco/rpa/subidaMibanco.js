const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('../../../../shared/config');
const { log } = require('../../../../shared/util');
const mfaLib = require('../../../../shared/mfa');

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

    log('Esperando post-login...');
    const reached = await page
      .waitForSelector('#fileUploaderButton', { state: 'visible', timeout: 90000 })
      .then(() => 'landing')
      .catch(() => 'mfa');

    if (reached === 'mfa') {
      const mfaShot = path.join(config.downloadDir, `mibanco_mfa_${Date.now()}.png`);
      await page.screenshot({ path: mfaShot, fullPage: true }).catch(() => {});
      log(`MFA detectado — captura: ${mfaShot}`);

      // Si hay botón para enviar el código OTP, clickearlo primero
      const enviarBtn = page.locator('button, input[type="submit"], a')
        .filter({ hasText: /Continuar|Enviar|Send code|Send/i }).first();
      if (await enviarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        log('Click en botón de envío de código OTP...');
        await enviarBtn.click();
        await page.waitForTimeout(1500);
      }

      log('Esperando código MFA del usuario en el dashboard (5 min)...');
      const code = await mfaLib.waitForCode(5 * 60 * 1000);
      log('Código MFA recibido');

      // Intentar detectar el campo OTP con varios selectores comunes
      const otpField = page.locator([
        'input[name*="otp" i]', 'input[name*="code" i]', 'input[name*="passcode" i]',
        'input[id*="otp" i]', 'input[id*="code" i]', 'input[type="tel"]',
        'input[maxlength="6"]', 'input[maxlength="8"]', 'input[maxlength="4"]',
      ].join(', ')).first();
      await otpField.waitFor({ state: 'visible', timeout: 15000 });
      await otpField.fill(code);
      await page.locator('button[type="submit"], input[type="submit"]').last().click();

      log('Código enviado, esperando landing post-MFA...');
      await page.waitForSelector('#fileUploaderButton', { state: 'visible', timeout: 30000 });
    }

    // Deja que React monte handlers y terminen XHRs del dashboard
    await page
      .waitForLoadState('networkidle', { timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    log('Login OK');

    log('Abriendo modal de carga');
    const notesInput = page.locator('textarea.wizard-notes-input');
    let modalAbierto = false;
    for (let intento = 1; intento <= 3 && !modalAbierto; intento++) {
      await page.locator('#fileUploaderButton').click();
      try {
        await notesInput.waitFor({ state: 'visible', timeout: 5000 });
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

    const folderInput = page.locator('input.wizard-upload-folder');
    let folderValue = '';
    for (let i = 0; i < 20; i++) {
      folderValue = (await folderInput.inputValue()) || '';
      if (folderValue.length > 0) break;
      await page.waitForTimeout(100);
    }
    log(`Carpeta destino "Cargar en": "${folderValue}"`);

    log(`Llenando Notas: "${config.mibanco.notas}"`);
    await notesInput.fill(config.mibanco.notas);

    log('Adjuntando archivo');
    await page
      .locator('input.file-selector-input:not([webkitdirectory])')
      .setInputFiles(archivoPath);

    log('Esperando que el botón Cargar se habilite');
    const cargarEnabled = page.locator(
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

    log('Esperando resultado terminal: "Cerrar" (éxito) o "Reintentar" (fallo)');
    const cerrarBtn = page.locator(
      'button[data-testid="modal-footer-button-primary"]:has-text("Cerrar")'
    );
    const reintentarBtn = page.locator(
      'button[data-testid="modal-footer-button-primary"]:has-text("Reintentar")'
    );
    await Promise.race([
      cerrarBtn.waitFor({ state: 'visible', timeout: 180000 }),
      reintentarBtn.waitFor({ state: 'visible', timeout: 180000 }),
    ]);

    if (await reintentarBtn.isVisible()) {
      const dupVisible = await page
        .locator('text=/ya existe|mismo nombre/i')
        .first()
        .isVisible()
        .catch(() => false);
      const causa = dupVisible
        ? 'archivo con el mismo nombre ya existe en la carpeta destino'
        : 'subida rechazada por el servidor';
      throw new Error(
        `Subida no completó (botón "Reintentar"): ${causa}. Revisa screenshot de error.`
      );
    }
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
    await notesInput.waitFor({ state: 'hidden', timeout: 15000 });

    // Da tiempo a que el listado de archivos refresque tras la subida
    const archivoNombre = path.basename(archivoPath);
    try {
      await page
        .locator(`text="${archivoNombre}"`)
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
      log(`Archivo "${archivoNombre}" visible en el listado de la carpeta`);
    } catch (_) {
      log(`(no se detectó el archivo en el listado, continuando)`);
    }

    const postShot = path.join(
      config.downloadDir,
      `mibanco_archivo_subido_${Date.now()}.png`
    );
    await page.screenshot({ path: postShot, fullPage: true });
    log(`Screenshot archivo subido: ${postShot}`);
    log('Subida completada (modal cerrado)');

    return { dryRun: false, screenshot: postShot, folderDestino: folderValue };
  } catch (err) {
    mfaLib.clearState();
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
