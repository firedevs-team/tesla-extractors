import puppeteer, { Page } from 'puppeteer';
import { MonthDateId, MonthExtractor } from '../../../lib';

const SITE_URL = 'https://cnevdata.com';

export default abstract class CNEVExtractor extends MonthExtractor {
  async download(dateId: MonthDateId): Promise<Buffer | null> {
    // Inicia el navegador
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'], // Argumentos para evitar problemas de permisos
    });

    // Abre una nueva pestaña
    const page = await browser.newPage();

    // Navega a la página deseada
    await page.goto(SITE_URL, { waitUntil: 'networkidle2' });

    // Expero a que este disponible el botón de sign in
    await page.waitForSelector('.header-buttons a');

    // Le doy click al botón de sign in
    await page.click('.header-buttons a');

    // Espera a que el iframe que muestra el sign in form esté disponible
    await page.waitForSelector('#memberful-iframe-for-overlay');

    // Obtén el iframe como un frame de Puppeteer
    const iframeElement = await page.$('#memberful-iframe-for-overlay');
    const iframe = await iframeElement.contentFrame();

    // Espero a que el iframe cargue
    await new Promise((resolve) => setTimeout(resolve, 3 * 1000));

    // Escribo el email
    await iframe.waitForSelector('#session_email');
    await iframe.click('#session_email');
    await iframe.type('#session_email', process.env.CNEV_DATA_USERNAME);

    // Le doy click al botón de continue
    await iframe.click('#session .btn-main');

    // Escribo la contraseña
    await iframe.waitForSelector('#session_password');
    await iframe.click('#session_password');
    await iframe.type('#session_password', process.env.CNEV_DATA_PASSWORD);

    // Le doy click al botón de sign in
    await iframe.click('#session .btn-main');

    // Espero a que el home me diga que estoy loggeado
    await page.waitForSelector('.home.logged-in');

    const buffer = await this.downloadFromPage(dateId, page);

    // Cierro el navegador
    await browser.close();

    return buffer;
  }

  abstract downloadFromPage(
    dateId: MonthDateId,
    page: Page
  ): Promise<Buffer | null>;
}
