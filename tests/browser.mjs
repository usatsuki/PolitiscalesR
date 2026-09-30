import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const remote = process.env.TEST_URL;
const base = remote || 'http://127.0.0.1:4175/PolitiscalesR/';
let server;
if (!remote) {
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    env: { ...process.env, PORT: '4175', MOUNT_PATH: '/PolitiscalesR/' }, stdio: ['ignore', 'pipe', 'inherit']
  });
  await once(server.stdout, 'data');
}
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const locales = ['en', 'zh-Hant', 'ja'];
try {
  for (const [index, locale] of locales.entries()) {
    const context = await browser.newContext({ viewport: { width: index ? 390 : 1280, height: index ? 844 : 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(locale + ': ' + error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
    page.on('request', request => { if (request.method() === 'POST') errors.push('Unexpected POST ' + request.url()); });
    const ready = async lang => {
      await page.waitForFunction(lang => document.documentElement.lang === lang && document.querySelector('.language')?.disabled === false && !document.getElementById('load-error'), lang);
    };
    await page.goto(base + '?lang=' + locale);
    await ready(locale);
    assert.equal(await page.locator('.language option').count(), 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, locale + ' home overflow');
    await page.screenshot({ path: 'test-results/home-' + locale + '.png', fullPage: true });
    await page.locator('.darkmode-btn input').check();
    assert.ok(await page.locator('body').evaluate(element => element.classList.contains('darkbody')));
    await page.locator('[data-i18n="start_button"]').click();
    await ready(locale);
    await page.waitForFunction(() => typeof quizReady !== 'undefined' && quizReady && questions.length === 117);
    await page.locator('.strong-agree').click();
    await page.locator('.disagree').click();
    await page.locator('#back_button').click();
    assert.equal(await page.evaluate(() => qn), 1);
    const other = locales[(index + 1) % locales.length];
    await page.locator('.language').selectOption(other);
    await ready(other);
    assert.equal(await page.evaluate(() => qn), 1);
    assert.equal(await page.evaluate(() => questions[0].answer), 1);
    await page.locator('.language').selectOption(locale);
    await ready(locale);
    assert.equal(await page.evaluate(() => questions[0].answer), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, locale + ' quiz overflow');
    await page.screenshot({ path: 'test-results/quiz-' + locale + '.png', fullPage: true });
    for (let question = 1; question < 117; question++) {
      await page.locator(['.agree', '.neutral', '.disagree', '.strong-disagree', '.strong-agree'][question % 5]).click();
    }
    await page.waitForURL('**/results/**');
    await ready(locale);
    const painted = async () => page.waitForFunction(() => document.getElementById('generatedResults').getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255);
    await painted();
    const resultUrl = page.url();
    const shared = await page.locator('#urlToCopy').textContent();
    assert.equal(shared, resultUrl);
    assert.ok(new URL(resultUrl).hash.length > 5);
    assert.equal(new URL(resultUrl).search, '?lang=' + locale);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, locale + ' results overflow');
    await page.screenshot({ path: 'test-results/results-' + locale + '.png', fullPage: true });
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#download').click();
    const download = await downloadEvent;
    assert.ok(download.suggestedFilename().endsWith('.png'));
    await download.saveAs('test-results/card-' + locale + '.png');
    await page.locator('.language').selectOption(other);
    await ready(other);
    assert.equal(new URL(await page.locator('#urlToCopy').textContent()).hash, new URL(resultUrl).hash);
    await page.goto(base + 'about/?lang=' + locale);
    await ready(locale);
    assert.equal(await page.locator('h3').count(), 8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, locale + ' about overflow');
    await page.goto(base + 'about_data/?lang=' + locale);
    await ready(locale);
    assert.ok((await page.locator('#mainFrame').textContent()).includes('GitHub'));
    await context.close();
    console.log(locale + ': complete quiz, language persistence, mobile layout, results/share/download, about and policy passed');
  }
  // Fresh direct entry, locale aliases, explicit URL precedence and denied storage.
  const context = await browser.newContext({ locale: 'ja-JP', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } }); });
  await page.goto(base + 'quiz/');
  await page.waitForFunction(() => typeof quizReady !== 'undefined' && quizReady && document.documentElement.lang === 'ja');
  await page.goto(base + 'quiz/?lang=zh-TW');
  await page.waitForFunction(() => typeof quizReady !== 'undefined' && quizReady && document.documentElement.lang === 'zh-Hant');
  await page.goto(base + 'quiz/?lang=en-US');
  await page.waitForFunction(() => typeof quizReady !== 'undefined' && quizReady && document.documentElement.lang === 'en');
  const sample = Buffer.from('c0=70&j1=45&b0=75').toString('base64');
  for (const suffix of ['?' + sample, '?lang=ja&data=' + encodeURIComponent(sample), '?lang=ja#not-valid']) {
    await page.goto(base + 'results/' + suffix);
    await page.waitForFunction(() => document.getElementById('generatedResults').getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255);
    if (!suffix.endsWith('not-valid')) assert.equal(await page.locator('#cAxisNegText').textContent(), '70%');
  }
  await context.close();
  const failureContext = await browser.newContext();
  const failurePage = await failureContext.newPage();
  await failurePage.route('**/langs/ja/static.json', route => route.abort());
  await failurePage.goto(base + 'quiz/?lang=ja');
  await failurePage.locator('#load-error').waitFor();
  assert.ok((await failurePage.locator('#load-error').textContent()).includes('読み込めません'));
  assert.equal(await failurePage.locator('.questionButtons button:disabled').count(), 5);
  await failureContext.close();
  assert.deepEqual(errors, []);
  console.log('Direct entry, language aliases, storage denial, legacy result URLs, malformed data: passed. No browser errors or failed requests.');
} finally {
  await browser.close();
  server?.kill();
}
