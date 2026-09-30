var questions = [];
var qn = 0;
var quizReady = false;
var now = new Date();
var quizSeed = new Date(now.getFullYear(), now.getMonth(), now.getDate()) / 1000;
var progressRestoreAttempted = false;
var savedProgressAvailable = false;
var progressMessageKey = 'progress_hint';

function progressStorageKey() {
  return 'politiscales.progress.v1:' + window.PolitiScales.baseUrl.pathname;
}

function readSavedProgress() {
  try {
    var saved = JSON.parse(localStorage.getItem(progressStorageKey()));
    var validAnswers = [-1, -2 / 3, 0, 2 / 3, 1];
    if (!saved || saved.version !== 1 || saved.questionnaire !== 'classic-117-v1' ||
        !Number.isSafeInteger(saved.seed) || saved.seed < 0 || saved.seed > 8640000000000 ||
        !Number.isSafeInteger(saved.savedAt) || saved.savedAt < 0 ||
        !Number.isInteger(saved.questionIndex) || saved.questionIndex < 0 || saved.questionIndex >= questions.length ||
        !Array.isArray(saved.answers) || saved.answers.length !== questions.length ||
        !saved.answers.every(function (answer) { return validAnswers.includes(answer); })) {
      return null;
    }
    return saved;
  } catch (_) { return null; }
}

function updateProgressStatus(key) {
  if (key) progressMessageKey = key;
  var status = document.getElementById('progress-status');
  status.setAttribute('data-i18n', progressMessageKey);
  status.textContent = $.i18n(progressMessageKey);
  document.getElementById('restart-progress').hidden = !savedProgressAvailable;
}

function save_progress() {
  if (!quizReady || qn >= questions.length) return;
  try {
    localStorage.setItem(progressStorageKey(), JSON.stringify({
      version: 1,
      questionnaire: 'classic-117-v1',
      seed: quizSeed,
      questionIndex: qn,
      answers: questions.map(function (question) { return question.answer; }),
      savedAt: Date.now()
    }));
    savedProgressAvailable = true;
    updateProgressStatus('progress_saved');
  } catch (_) {
    updateProgressStatus('progress_save_failed');
  }
}

function restart_quiz() {
  if (!quizReady || !window.confirm($.i18n('progress_restart_confirm'))) return;
  try {
    localStorage.removeItem(progressStorageKey());
  } catch (_) {
    updateProgressStatus('progress_restart_failed');
    return;
  }
  // Keep this session's shuffled order; never reshuffle an already shuffled list.
  questions.forEach(function (question) { question.answer = 0; });
  qn = 0;
  savedProgressAvailable = false;
  start_time();
  init_question();
  updateProgressStatus('progress_restarted');
}

async function loadQuizLanguage(language) {
  quizReady = false;
  var answers = questions.map(function (question) { return question.answer; });
  await new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = new URL('langs/' + language + '/questions.js', window.PolitiScales.baseUrl).href;
    script.onload = function () { script.remove(); resolve(); };
    script.onerror = function () { script.remove(); reject(new Error('Question file failed to load')); };
    document.head.appendChild(script);
  });
  if (!progressRestoreAttempted) {
    var saved = readSavedProgress();
    progressRestoreAttempted = true;
    if (saved) {
      quizSeed = saved.seed;
      qn = saved.questionIndex;
      answers = saved.answers;
      savedProgressAvailable = true;
      progressMessageKey = 'progress_restored';
    }
  }
  shuffle(questions, quizSeed);
  questions.forEach(function (question, index) {
    if (index < answers.length) question.answer = answers[index];
  });
  quizReady = true;
  init_question();
  updateProgressStatus();
  document.querySelectorAll('.questionButtons button, .quiz-progress button').forEach(function (button) { button.disabled = false; });
}

start_time();

function init_quiz() {
  qn = 0; // Question number
  prev_answer = null;

  init_question();

}

// Count time passed on the quiz
function start_time() {
  startTime = new Date();
};

function end_time() {
  endTime = new Date();
  var timeDiff = endTime - startTime; //in ms
  // strip the ms
  timeDiff /= 1000;

  // get seconds
  var seconds = Math.round(timeDiff);
  return(seconds);
}

function shuffle(array, seed) {
  let currentIndex = array.length, temporaryValue, randomIndex;
  seed = seed || 1;
  let random = function() {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };
  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(random() * currentIndex);
    currentIndex -= 1;
    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }
  return array;
}

function init_question() {
  question_string = $.i18n("question")
  ques_of_string = $.i18n("of")

  document.getElementById("question-text").textContent = questions[qn].question;
  document.getElementById(
    "question-number"
  ).innerHTML = question_string +" "+ (qn + 1) +" "+  ques_of_string +" "+ questions.length

  if (qn == 0) {
    document.getElementById("back_button").style.display = "none";
    document.getElementById("back_button_off").style.display = "block";
  } else {
    document.getElementById("back_button").style.display = "block";
    document.getElementById("back_button_off").style.display = "none";
  }
}

function next_question(mult) {
  if (!quizReady || qn >= questions.length) return;
  questions[qn].answer = mult;
  qn++;
  updateProgressStatus(savedProgressAvailable ? 'progress_unsaved' : 'progress_hint');

  if (qn < questions.length) {
    init_question();
  } else {
    results();
  }
}
function prev_question() {
  if (!quizReady || qn == 0) {
    return;
  }
  qn--;
  init_question();
  updateProgressStatus(savedProgressAvailable ? 'progress_unsaved' : 'progress_hint');
}

function calc_score(score, max_value) {
  return ((100 * score) / max_value).toFixed(0);
}

function results() {
  var axes = {};

  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];

    for (var j = 0; j < q.valuesYes.length; j++) {
      var a = q.valuesYes[j];
      if (!(a.axis in axes)) {
        axes[a.axis] = {
          val: 0,
          sum: 0
        };
      }

      if (q.answer > 0) {
        axes[a.axis].val += q.answer * a.value;
      }
      axes[a.axis].sum += Math.max(a.value, 0);
    }

    for (var j = 0; j < q.valuesNo.length; j++) {
      var a = q.valuesNo[j];
      if (!(a.axis in axes)) {
        axes[a.axis] = {
          val: 0,
          sum: 0
        };
      }

      if (q.answer < 0) {
        axes[a.axis].val -= q.answer * a.value;
      }
      axes[a.axis].sum += Math.max(a.value, 0);
    }
  }

  var url = "";
  for (var aK in axes) {
    if (axes[aK].val > 0) {
      if (url != "") url += "&";
      url += aK + "=" + calc_score(axes[aK].val, axes[aK].sum);
    }
  }

  quizReady = false;
  var destination = new URL('results/', window.PolitiScales.baseUrl);
  destination.searchParams.set('lang', window.PolitiScales.language);
  // Fragments stay in the browser and are not sent to the hosting server.
  destination.hash = window.btoa(url);
  // A completed test must not reopen an old saved checkpoint.
  try { localStorage.removeItem(progressStorageKey()); } catch (_) { /* Completion must still work without storage. */ }
  location.href = destination.href;
}
