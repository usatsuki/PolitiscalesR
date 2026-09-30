/* Resolve language before requesting question files. */
(function () {
  const baseUrl = new URL('.', document.baseURI);
  const supported = ['en', 'zh-Hant', 'ja'];
  function normalizeLanguage(value) {
    const tag = String(value || '').replace(/_/g, '-').toLowerCase();
    if (/^zh(?:-|$)/.test(tag)) return 'zh-Hant';
    if (/^ja(?:-|$)/.test(tag)) return 'ja';
    if (/^en(?:-|$)/.test(tag)) return 'en';
    return null;
  }
  function readPreference(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function savePreference(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* Storage may be disabled. */ }
  }
  const requested = new URL(location.href).searchParams.get('lang');
  const language = normalizeLanguage(requested) || normalizeLanguage(readPreference('language')) ||
    (navigator.languages || [navigator.language]).map(normalizeLanguage).find(Boolean) || 'en';
  window.PolitiScales = { baseUrl, supported, language, normalizeLanguage };

  async function updateText(language) {
    const selector = document.querySelector('.language');
    selector.disabled = true;
    document.querySelectorAll('.questionButtons button').forEach(button => { button.disabled = true; });
    try {
      const messages = {};
      await Promise.all([...new Set(['en', language])].map(async locale => {
        const response = await fetch(new URL('langs/' + locale + '/static.json', baseUrl));
        if (!response.ok) throw new Error('Unable to load ' + locale + ' translations');
        messages[locale] = await response.json();
      }));
      await $.i18n().load(messages);
      $.i18n().locale = language;
      window.PolitiScales.language = language;
      savePreference('language', language);
      selector.value = language;
      document.documentElement.lang = language;
      $('body').i18n();
      document.title = $.i18n(pageType + '_title');
      document.querySelector('meta[name="description"]').content = $.i18n('description');
      document.querySelector('meta[property="og:description"]').content = $.i18n('description');
      document.querySelector('meta[property="og:title"]').content = document.title;
      document.querySelector('meta[property="og:locale"]').content = { en: 'en_US', 'zh-Hant': 'zh_TW', ja: 'ja_JP' }[language];
      document.querySelector('.about').title = $.i18n('about');
      document.querySelector('.about').setAttribute('aria-label', $.i18n('about'));
      const labels = {
        en: ['Language', 'Dark mode'],
        'zh-Hant': ['語言', '深色模式'],
        ja: ['言語', 'ダークモード']
      }[language];
      selector.setAttribute('aria-label', labels[0]);
      document.querySelector('.darkmode-btn input').setAttribute('aria-label', labels[1]);
      const current = new URL(location.href);
      if (pageType === 'results' && current.search && !current.searchParams.has('lang') && !current.searchParams.has('data')) {
        current.hash = current.search.slice(1);
        current.search = '';
      }
      current.searchParams.set('lang', language);
      history.replaceState(null, '', current.href);
      document.querySelector('meta[property="og:url"]').content = current.origin + current.pathname + '?lang=' + language;
      document.querySelectorAll('a[href]').forEach(link => {
        const raw = link.getAttribute('href');
        if (raw.startsWith('#')) return;
        const url = new URL(raw, baseUrl);
        if (url.origin === baseUrl.origin && url.pathname.startsWith(baseUrl.pathname)) {
          url.searchParams.set('lang', language);
          link.href = url.href;
        }
      });
      if (pageType === 'quiz') await loadQuizLanguage(language);
      if (pageType === 'results') init_results();
      document.getElementById('load-error')?.remove();
    } catch (error) {
      console.error('Unable to load the selected language.', error);
      let notice = document.getElementById('load-error');
      if (!notice) {
        notice = document.createElement('p');
        notice.id = 'load-error';
        notice.className = 'simpleText';
        notice.setAttribute('role', 'alert');
        document.getElementById('mainFrame').prepend(notice);
      }
      notice.textContent = {
        en: 'Unable to load the test. Please reload the page to try again.',
        'zh-Hant': '無法載入測驗，請重新整理頁面再試一次。',
        ja: 'テストを読み込めませんでした。ページを再読み込みしてください。'
      }[language];
    } finally {
      selector.disabled = false;
    }
  }
  $(function () {
    $.extend($.i18n.parser.emitter, { sitename: function () { return $.i18n('sitename'); } });
    const dark = document.querySelector('.darkmode-btn input');
    dark.checked = readPreference('darkmode') === 'true';
    document.body.classList.toggle('darkbody', dark.checked);
    dark.addEventListener('change', function () {
      document.body.classList.toggle('darkbody', dark.checked);
      savePreference('darkmode', String(dark.checked));
    });
    document.querySelector('.language').addEventListener('change', event => updateText(event.target.value));
    updateText(language);
  });
})();
