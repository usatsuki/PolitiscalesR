import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const languages = ['en', 'zh-Hant', 'ja'];
const translations = Object.fromEntries(languages.map(language => [
  language, JSON.parse(read('langs/' + language + '/static.json'))
]));

function loadQuestions(language) {
  const context = {};
  vm.runInNewContext(read('langs/' + language + '/questions.js'), context, { timeout: 1000 });
  // Convert values from the isolated context to ordinary objects for comparison.
  return JSON.parse(JSON.stringify(context.questions));
}

const questions = Object.fromEntries(languages.map(language => [language, loadQuestions(language)]));
const englishKeys = Object.keys(translations.en).sort();
const scoringMetadata = items => items.map(({ question, ...metadata }) => metadata);
const placeholders = value => (value.match(/\{\{[^}]+\}\}/g) || []).sort();
const htmlTags = value => value.match(/<[^>]+>/g) || [];

test('the original English question text and scoring source are preserved', () => {
  // Git checks out CRLF on Windows and LF on Linux. Normalize only line endings.
  const source = read('langs/en/questions.js').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  assert.equal(createHash('sha256').update(source).digest('hex'),
    'cbf26fc966e26d6b2b31c92f0e1b161fca7a22a461d6d63212f50763c669a5f2');
  assert.equal(questions.en.length, 117);
});

test('the original 97 English interface strings are preserved', () => {
  const source = read('langs/en/static.json').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  assert.equal(createHash('sha256').update(source).digest('hex'),
    'fb433278d861ae5db9b37c27fedf6e7cc96e8e14ce55fab3fe289f67dde21180');
  assert.equal(englishKeys.length, 97);
});

for (const language of ['zh-Hant', 'ja']) {
  test(language + ' contains all questions in the canonical scoring order', () => {
    assert.equal(questions[language].length, 117);
    assert.deepEqual(scoringMetadata(questions[language]), scoringMetadata(questions.en));
    for (const [index, item] of questions[language].entries()) {
      assert.equal(typeof item.question, 'string');
      assert.ok(item.question.trim(), 'Question ' + (index + 1) + ' is empty');
      assert.notEqual(item.question, questions.en[index].question,
        'Question ' + (index + 1) + ' is still in English');
      assert.match(item.question, /[\u3040-\u30ff\u3400-\u9fff]/u,
        'Question ' + (index + 1) + ' must contain translated text');
    }
  });

  test(language + ' translates every original interface string', () => {
    const locale = translations[language];
    assert.deepEqual(Object.keys(locale).sort(), englishKeys);
    for (const key of englishKeys) {
      assert.equal(typeof locale[key], 'string', key);
      assert.ok(locale[key].trim(), key + ' is empty');
      if (key !== 'sitename') assert.notEqual(locale[key], translations.en[key], key + ' is still in English');
      assert.deepEqual(placeholders(locale[key]), placeholders(translations.en[key]), key + ' placeholders');
      assert.deepEqual(htmlTags(locale[key]), htmlTags(translations.en[key]), key + ' HTML structure and links');
    }
  });
}

// Captured by executing the unmodified upstream/main quiz.js at this commit.
// Fixed fixtures keep regression tests portable in shallow clones without the upstream remote.
const upstreamCommit = '441d46096b162786e3c7ef236efeafb3281cf3fe';
const expected = {
  neutral: '',
  agree: 'c0=50&femi=43&c1=50&b0=50&b1=50&p0=50&p1=50&m0=50&m1=50&s0=50&s1=50&j1=50&j0=50&e0=50&e1=50&t0=50&t1=50&reli=100&comp=100&prag=100&mona=100&vega=100&anar=100',
  somewhatAgree: 'c0=25&femi=21&c1=25&b0=25&b1=25&p0=25&p1=25&m0=25&m1=25&s0=25&s1=25&j1=25&j0=25&e0=25&e1=25&t0=25&t1=25&reli=50&comp=50&prag=50&mona=50&vega=50&anar=50',
  disagree: 'c0=50&femi=57&c1=50&b0=50&b1=50&p0=50&p1=50&m0=50&m1=50&s0=50&s1=50&j1=50&j0=50&e0=50&e1=50&t0=50&t1=50',
  somewhatDisagree: 'c0=25&femi=29&c1=25&b0=25&b1=25&p0=25&p1=25&m0=25&m1=25&s0=25&s1=25&j1=25&j0=25&e0=25&e1=25&t0=25&t1=25',
  alternating: 'c0=21&femi=14&c1=36&b0=32&b1=29&p0=43&p1=21&m0=32&m1=29&s0=21&s1=36&j1=36&j0=32&e0=21&e1=36&t0=32&t1=29&prag=50&mona=100',
  mixed: 'c0=7&c1=71&b0=32&b1=25&p0=50&m0=29&m1=36&s0=14&s1=61&j1=4&j0=50&e0=46&e1=4&t1=79'
};
const patterns = {
  neutral: () => 0,
  agree: () => 1,
  somewhatAgree: () => 0.5,
  disagree: () => -1,
  somewhatDisagree: () => -0.5,
  alternating: index => [-1, -0.5, 0, 0.5, 1][index % 5],
  mixed: index => [-1, -0.5, 0, 0.5, 1][(((index + 37) * 1103515245 + 12345) >>> 0) % 5]
};

function runScoring(source, language, answer) {
  let postedResult;
  let postCount = 0;
  const jquery = {
    ajax() {}, // Do not load a question script; inject the canonical order below.
    post(url, payload) {
      postCount++;
      postedResult = payload.data;
      return { always(callback) { callback(); } };
    }
  };
  const context = {
    URL,
    $: jquery,
    jQuery: jquery,
    localStorage: { getItem: () => language },
    navigator: { language },
    console: { log() {} },
    window: {
      btoa: value => Buffer.from(value, 'binary').toString('base64'),
      PolitiScales: { baseUrl: new URL('https://example.test/PolitiscalesR/'), language }
    },
    location: { href: '' }
  };
  vm.runInNewContext(source, context, { timeout: 1000 });
  context.questions = structuredClone(questions[language]);
  context.questions.forEach((question, index) => { question.answer = answer(index); });
  vm.runInNewContext('results()', context, { timeout: 1000 });
  const destination = new URL(context.location.href, context.window.PolitiScales.baseUrl);
  const encoded = postedResult ?? destination.hash.slice(1);
  return { scores: Buffer.from(encoded, 'base64').toString('utf8'), destination, postCount };
}

const currentQuiz = read('quiz.js');
for (const language of languages) {
  for (const [pattern, answer] of Object.entries(patterns)) {
    test(language + ' preserves upstream scores for ' + pattern + ' answers', () => {
      const result = runScoring(currentQuiz, language, answer);
      assert.equal(result.scores, expected[pattern]);
      assert.equal(result.destination.pathname, '/PolitiscalesR/results/');
      assert.equal(result.destination.searchParams.get('lang'), language);
      assert.deepEqual([...result.destination.searchParams.keys()], ['lang'], 'Scores must stay out of the query string');
      assert.equal(result.postCount, 0, 'The static fork must not submit political results to a server');
    });
  }
}

let upstreamQuiz;
try {
  upstreamQuiz = execFileSync('git', ['show', upstreamCommit + ':quiz.js'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  });
} catch {
  // The captured fixtures above remain active when Git history is unavailable.
}

test('direct comparison with the original upstream scoring implementation', {
  skip: upstreamQuiz ? false : 'Original upstream commit is unavailable; fixed upstream fixtures remain covered'
}, () => {
  for (const [pattern, answer] of Object.entries(patterns)) {
    const original = runScoring(upstreamQuiz, 'en', answer);
    assert.equal(original.scores, expected[pattern], 'Fixture provenance: ' + pattern);
    for (const language of languages) {
      assert.equal(runScoring(currentQuiz, language, answer).scores, original.scores,
        language + ' scoring differs from upstream for ' + pattern);
    }
  }
});
