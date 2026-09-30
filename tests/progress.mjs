import assert from 'node:assert/strict';

const locales = ['en', 'zh-Hant', 'ja'];
const savedDay = '2030-04-01T23:55:00Z';
const restoredDay = '2030-04-02T00:05:00Z';

async function ready(page, language) {
  await page.waitForFunction(language =>
    typeof quizReady !== 'undefined' && quizReady && questions.length === 117 &&
    document.documentElement.lang === language && !document.querySelector('.language').disabled &&
    !document.getElementById('load-error'), language);
}

async function readState(page) {
  return page.evaluate(() => ({
    seed: quizSeed,
    index: qn,
    answers: questions.map(question => question.answer),
    wording: questions.map(question => question.question),
    metadata: questions.map(({ question, answer, ...metadata }) => metadata)
  }));
}

async function status(page, key) {
  await page.waitForFunction(key => document.getElementById('progress-status')?.getAttribute('data-i18n') === key, key);
  const text = (await page.locator('#progress-status').textContent()).trim();
  assert.ok(text, key + ' status must be visible to the user');
  assert.notEqual(text, key, key + ' status must be translated');
}

async function confirmRestart(page, accept) {
  const pendingDialog = page.waitForEvent('dialog');
  const pendingClick = page.locator('#restart-progress').click();
  const dialog = await pendingDialog;
  assert.equal(dialog.type(), 'confirm');
  assert.ok(dialog.message().trim(), 'Restart confirmation must explain the action');
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await pendingClick;
}

/** Exercise manual local progress in isolated browser contexts; no existing tabs are used. */
export async function testProgress(browser, base) {
  const baseUrl = new URL(base);
  const storageKey = 'politiscales.progress.v1:' + baseUrl.pathname;
  const quizUrl = language => {
    const url = new URL('quiz/', baseUrl);
    url.searchParams.set('lang', language);
    return url.href;
  };
  const errors = [];
  const watch = page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() === 'POST') errors.push('Progress must stay local: ' + request.url());
    });
  };

  for (const [localeIndex, locale] of locales.entries()) {
    const context = await browser.newContext({
      viewport: { width: localeIndex ? 390 : 1280, height: 900 },
      reducedMotion: 'reduce', timezoneId: 'UTC'
    });
    try {
      let page = await context.newPage();
      watch(page);
      await page.clock.install({ time: new Date(savedDay) });
      await page.goto(quizUrl(locale));
      await ready(page, locale);
      assert.equal(await page.evaluate(() => qn), 0);
      assert.ok(await page.locator('#restart-progress').isHidden(), 'Restart is hidden before any saved progress');
      const placement = await page.evaluate(() => {
        const save = document.getElementById('save-progress');
        const agree = document.querySelector('.strong-agree');
        return {
          before: Boolean(save.compareDocumentPosition(agree) & Node.DOCUMENT_POSITION_FOLLOWING),
          above: save.getBoundingClientRect().bottom <= agree.getBoundingClientRect().top + 1
        };
      });
      assert.deepEqual(placement, { before: true, above: true }, locale + ' save button appears above the green answer');

      await page.locator('.strong-agree').click();
      await page.locator('.neutral').click();
      await page.locator('.disagree').click();
      await page.locator('#back_button').click();
      assert.equal(await page.evaluate(() => qn), 2);
      await page.locator('.agree').click();
      await page.locator('.strong-disagree').click();
      await page.locator('#back_button').click();
      const savedState = await readState(page);
      assert.equal(savedState.index, 3);
      assert.deepEqual(savedState.answers.slice(0, 4), [1, 0, 2 / 3, -1], 'Neutral, edited and previously answered later questions are retained');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null, 'Saving requires the manual button');

      await page.locator('#save-progress').click();
      await status(page, 'progress_saved');
      assert.ok(await page.locator('#restart-progress').isVisible());
      const snapshotText = await page.evaluate(key => localStorage.getItem(key), storageKey);
      const snapshot = JSON.parse(snapshotText);
      assert.equal(snapshot.version, 1);
      assert.equal(snapshot.questionnaire, 'classic-117-v1');
      assert.equal(snapshot.seed, savedState.seed);
      assert.equal(snapshot.questionIndex, savedState.index);
      assert.deepEqual(snapshot.answers, savedState.answers);
      assert.equal(snapshot.answers.length, 117);
      assert.ok(snapshot.savedAt && Number.isFinite(new Date(snapshot.savedAt).getTime()), 'Snapshot has a valid save time');

      // A locale change must preserve newer live answers without reloading the older checkpoint.
      await page.locator('.agree').click();
      const unsavedState = await readState(page);
      assert.equal(unsavedState.index, 4);
      assert.equal(unsavedState.answers[3], 2 / 3);
      const otherLocale = locales[(localeIndex + 1) % locales.length];
      await page.locator('.language').selectOption(otherLocale);
      await ready(page, otherLocale);
      const unsavedTranslatedState = await readState(page);
      assert.equal(unsavedTranslatedState.seed, unsavedState.seed);
      assert.equal(unsavedTranslatedState.index, unsavedState.index);
      assert.deepEqual(unsavedTranslatedState.answers, unsavedState.answers, 'Language changes retain unsaved edits');
      assert.deepEqual(unsavedTranslatedState.metadata, unsavedState.metadata);
      await page.locator('.language').selectOption(locale);
      await ready(page, locale);
      assert.deepEqual(await readState(page), unsavedState, 'Switching languages back preserves the live state');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), snapshotText,
        'Answering and switching languages do not overwrite the manually saved checkpoint');

      await page.close();
      page = await context.newPage();
      watch(page);
      // The clock belongs to the context and remains installed after the original tab closes.
      await page.clock.setSystemTime(new Date(restoredDay));
      await page.goto(quizUrl(locale));
      await ready(page, locale);
      await status(page, 'progress_restored');
      assert.deepEqual(await readState(page), savedState, locale + ' restores the saved checkpoint, not unsaved edits, after midnight');
      const todaySeed = await page.evaluate(() => {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() / 1000;
      });
      assert.notEqual(todaySeed, savedState.seed, 'Test must cross the daily shuffle boundary');
      assert.ok(await page.locator('#restart-progress').isVisible());

      await page.locator('.language').selectOption(otherLocale);
      await ready(page, otherLocale);
      const translatedState = await readState(page);
      assert.equal(translatedState.seed, savedState.seed);
      assert.equal(translatedState.index, savedState.index);
      assert.deepEqual(translatedState.answers, savedState.answers);
      assert.deepEqual(translatedState.metadata, savedState.metadata, 'Changing language preserves question identities');
      assert.notDeepEqual(translatedState.wording, savedState.wording, 'Changing language actually translates the questions');

      await confirmRestart(page, false);
      assert.deepEqual(await readState(page), translatedState, 'Cancelling restart preserves the active answers');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), snapshotText, 'Cancelling restart preserves the saved snapshot');
      await confirmRestart(page, true);
      await page.waitForFunction(() => quizReady && qn === 0);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null, 'Confirmed restart removes saved progress');
      assert.ok((await readState(page)).answers.every(answer => answer === 0), 'Confirmed restart clears every answer');
      await page.locator('.neutral').click();
      assert.equal(await page.evaluate(() => qn), 1, 'The restarted quiz remains usable');
      console.log(locale + ': manual save, edited/neutral answers, overnight restore, language switch and restart passed');
    } finally {
      await context.close();
    }
  }

  const validShape = {
    version: 1, questionnaire: 'classic-117-v1', seed: 1901318400,
    questionIndex: 4, answers: Array(117).fill(0), savedAt: Date.parse(savedDay)
  };
  const corruptCases = {
    'invalid JSON': '{broken-json',
    'unsupported version': JSON.stringify({ ...validShape, version: 99 }),
    'truncated answers': JSON.stringify({ ...validShape, answers: [1, 0] }),
    'invalid answer': JSON.stringify({ ...validShape, answers: [7, ...Array(116).fill(0)] }),
    'invalid question index': JSON.stringify({ ...validShape, questionIndex: 117 })
  };
  for (const [label, value] of Object.entries(corruptCases)) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      await context.addInitScript(({ key, value }) => { localStorage.setItem(key, value); }, { key: storageKey, value });
      const page = await context.newPage();
      watch(page);
      await page.goto(quizUrl('en'));
      await ready(page, 'en');
      assert.equal(await page.evaluate(() => qn), 0, label + ' starts a fresh quiz');
      assert.ok((await readState(page)).answers.every(answer => answer === 0), label + ' does not inject saved answers');
      await page.locator('.agree').click();
      assert.equal(await page.evaluate(() => qn), 1, label + ' does not prevent answering');
    } finally {
      await context.close();
    }
  }

  for (const failure of ['denied', 'quota']) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      await context.addInitScript(({ failure, key }) => {
        if (failure === 'denied') {
          Object.defineProperty(window, 'localStorage', {
            get() { throw new DOMException('Storage is disabled', 'SecurityError'); }
          });
        } else {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new DOMException('Storage is full', 'QuotaExceededError');
            return original.call(this, name, value);
          };
        }
      }, { failure, key: storageKey });
      const page = await context.newPage();
      watch(page);
      const locale = failure === 'denied' ? 'zh-Hant' : 'ja';
      await page.goto(quizUrl(locale));
      await ready(page, locale);
      await page.locator('.neutral').click();
      await page.locator('.agree').click();
      const stateBeforeSave = await readState(page);
      await page.locator('#save-progress').click();
      await status(page, 'progress_save_failed');
      assert.deepEqual(await readState(page), stateBeforeSave, failure + ' preserves current answers');
      if (failure === 'quota') {
        assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), null);
      }
      await page.locator('.strong-disagree').click();
      assert.equal(await page.evaluate(() => qn), 3, failure + ' still allows answering');
      await page.locator('#back_button').click();
      assert.equal(await page.evaluate(() => qn), 2, failure + ' still allows going back');
    } finally {
      await context.close();
    }
  }

  assert.deepEqual(errors, [], 'Saving and restoring must not cause browser errors or send results to a server');
  console.log('Corrupt progress, storage denial and storage quota failure: passed');
}
