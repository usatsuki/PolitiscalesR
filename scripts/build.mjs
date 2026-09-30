import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteCopy } from './site-copy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const languages = ['en', 'zh-Hant', 'ja'];
const siteUrl = new URL(process.env.SITE_URL || 'https://usatsuki.github.io/PolitiscalesR/');
const read = path => readFile(join(root, path), 'utf8');
const english = { ...JSON.parse(await read('langs/en/static.json')), ...siteCopy.en };
const escape = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const message = key => {
  const html = key.startsWith('[html]');
  const value = english[key.replace(/^\[html\]/, '')];
  if (value === undefined) throw new Error('Missing translation: ' + key);
  const text = value.replaceAll('{{SITENAME}}', english.sitename);
  return html ? text : escape(text);
};

await mkdir(dist, { recursive: true });
for (const path of ['images', 'src', 'style.css', 'main.js', 'quiz.js', 'results.js', 'flags.js', 'LICENSE']) {
  await cp(join(root, path), join(dist, path), { recursive: true });
}
for (const language of languages) {
  const destination = join(dist, 'langs', language);
  await mkdir(destination, { recursive: true });
  const locale = { ...JSON.parse(await read('langs/' + language + '/static.json')), ...siteCopy[language] };
  await writeFile(join(destination, 'static.json'), JSON.stringify(locale, null, 2) + '\n');
  await cp(join(root, 'langs', language, 'questions.js'), join(destination, 'questions.js'));
}

const header = `<header><div id="header">
  <a class="about" href="./about/" title="About" aria-label="About"><svg style="width:1.9em;height:1.9em" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z" /></svg></a>
  <a class="title" href="./"><img src="./images/politiscales.png" alt="" width="60" height="60"><h1>PolitiScales</h1></a>
  <select class="language" aria-label="Language" disabled><option value="en" lang="en">English</option><option value="zh-Hant" lang="zh-Hant">繁體中文</option><option value="ja" lang="ja">日本語</option></select>
</div></header>`;

for (const [source, type, route] of [
  ['index.php', 'home', ''], ['quiz.php', 'quiz', 'quiz/'], ['results.php', 'results', 'results/'],
  ['about.php', 'about', 'about/'], ['about_data.php', 'data', 'about_data/']
]) {
  const head = `<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${route ? '../' : './'}">
  <title>${message(type + '_title')}</title>
  <meta name="description" content="${message('description')}">
  <meta name="referrer" content="no-referrer">
  <link rel="stylesheet" href="./style.css"><link rel="icon" href="./images/favicon.ico">
  <meta property="og:url" content="${new URL(route, siteUrl)}">
  <meta property="og:title" content="${message(type + '_title')}"><meta property="og:locale" content="en_US">
  <meta property="og:description" content="${message('description')}"><meta property="og:image" content="${new URL('images/politiscales_cover.png', siteUrl)}">
  <meta name="twitter:card" content="summary">
  <script src="./src/jquery-3.2.1.min.js"></script>
  <script>var pageType = ${JSON.stringify(type)};</script>
  ${['jquery.i18n', 'jquery.i18n.messagestore', 'jquery.i18n.fallbacks', 'jquery.i18n.parser', 'jquery.i18n.emitter', 'jquery.i18n.language'].map(name => '<script src="./src/' + name + '.js"></script>').join('\n  ')}
  <script src="./main.js"></script>
</head>`;
  let html = await read(source);
  html = html.replace(/<\?php\s+\$page_type[\s\S]*?\?>/, '')
    .replace(/<\?php include\('partials\/head.php'\);? \?>/, head)
    .replace(/<\?php include\('partials\/header.php'\);? \?>/, type === 'quiz' ? header.replace('class="about"', 'class="about" target="_blank" rel="noopener"') : header)
    .replace(/<\?php include\('partials\/footer.php'\);? \?>/, await read('partials/footer.php'))
    .replace(/<\?= \$i18n->_lang \?>/g, 'en')
    .replace(/alt="<\?= \$i18n->get\("([^"]+)"\) \?>"/g, (_, key) => 'alt="' + message(key) + '" data-i18n="[alt]' + key + '"')
    .replace(/<\?= \$i18n->get\("([^"]+)"\) \?>/g, (_, key) => message(key))
    .replace(/<\?php if \(isset\(\$_GET\['lang'\]\)\) \{ echo "\?lang="\.\$_GET\['lang'\]; \} \?>/g, '')
    .replace(/href="\.\/(quiz|about|about_data|results)"/g, 'href="./$1/"')
    .replace('onclick="prev_question()"', 'onclick="prev_question(); return false;"')
    .replaceAll('<button onclick="next_question(', '<button disabled onclick="next_question(')
    .replace('<div class="navButtons questionButtons">', `<div class="quiz-progress">
      <button type="button" id="save-progress" onclick="save_progress()" disabled data-i18n="save_progress">${message('save_progress')}</button>
      <p id="progress-status" role="status" aria-live="polite" data-i18n="progress_hint">${message('progress_hint')}</p>
      <button type="button" id="restart-progress" onclick="restart_quiz()" disabled hidden data-i18n="progress_restart">${message('progress_restart')}</button>
    </div>
    <div class="navButtons questionButtons">`)
    .replace('<h2 id="question-number">', '<h2 id="question-number" aria-live="polite">')
    .replace('<input type="checkbox">', '<input type="checkbox" aria-label="Dark mode">')
    .replace('<body>', '<body>\n<noscript><p class="simpleText">' + siteCopy.en.no_script + '</p></noscript>');
  if (html.includes('<?')) throw new Error('Unresolved PHP in ' + source);
  const destination = join(dist, route, 'index.html');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, html.trimStart());
}
await writeFile(join(dist, '.nojekyll'), '');
console.log('Built 5 pages with English, Traditional Chinese and Japanese into dist/.');
