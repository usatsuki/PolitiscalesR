# PolitiScales R — English / 繁體中文 / 日本語

A multilingual fork of [Conobi/politiscales](https://github.com/Conobi/politiscales), based on its production `main` branch at `441d46096b162786e3c7ef236efeafb3281cf3fe` rather than the unfinished `re` rewrite.

**Website:** [English](https://usatsuki.github.io/PolitiscalesR/?lang=en) · [繁體中文](https://usatsuki.github.io/PolitiscalesR/?lang=zh-Hant) · [日本語](https://usatsuki.github.io/PolitiscalesR/?lang=ja)

- Preserves all 117 original English questions, their scoring weights, eight axes, and flag generation rules.
- Adds complete Traditional Chinese and Japanese questions, instructions, axis explanations, result labels, and sharing text.
- Supports language switching during a quiz without losing the question position or answers. An explicit `?lang=` link takes precedence over saved and browser preferences; regional tags such as `zh-TW` and `ja-JP` are supported.
- The Save progress button above the answer choices stores a manual checkpoint in this browser. Reopening the quiz restores the saved answers, position and original question order, even on a later day. Save again after further answers; finishing the test or choosing Start over clears the saved checkpoint.
- Retains the original design and dark mode, with readable CJK text and mobile controls.
- Calculates scores in the browser. Result links encode scores after `#`; no answers are posted to the upstream statistics endpoint. The footer and data policy describe this fork's actual behavior.

## Run locally

Requires Node.js 22 or later. The static build and unit tests have no package dependencies.

```sh
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:4173/`. To run the browser checks:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The browser checks complete all 117 questions in each language, exercise mid-quiz switching and back navigation, verify downloaded images and result links, check mobile overflow, and test direct entry with unavailable browser storage. Screenshots and downloads are written to ignored `test-results/`.

## Build and deployment

`scripts/build.mjs` adapts the original PHP page templates into five static HTML pages in `dist/`. It includes only public browser assets; PHP endpoints, database tooling, and source-only files are not deployed. English source translations remain unchanged; `scripts/site-copy.mjs` supplies the fork-specific footer and data policy at build time.

The `multilingual` branch is this fork's maintained/default branch. `.github/workflows/pages.yml` tests, builds, and publishes it through GitHub Pages. Other upstream branches remain available for reference. The deployment requires Pages to use **GitHub Actions** as its source. If hosting elsewhere, set `SITE_URL` to the full site base URL before building and update the deployment-specific links and policy in `scripts/site-copy.mjs`.

The unit checks enforce original English file contents, complete locale coverage, identical scoring metadata, placeholders and HTML structure, and original scoring results for seven answer patterns. Translations were additionally reviewed for polarity, ownership, quantifiers, and political terminology; future translation improvements should keep the English meaning and weights intact.

## Credits and license

This edition is adapted and maintained by **YUZU SUMINO**.

Original project: Radicalisé·e·s sur Internet / Dirtbag HQ, inspired by 8values, subsequently maintained by Conobi. This fork retains the original [MIT license](LICENSE), original assets, and upstream history.

The MIT license permits modification and redistribution provided the original copyright and permission notice are retained. The published site includes that license and the [third-party notices](THIRD_PARTY_NOTICES.txt) for jQuery, its bundled Sizzle engine, and jquery.i18n (under its MIT license option). Original library copyright headers are preserved.

---

## Upstream README

<h1 align="center"><img src="https://politiscales.party/images/politiscales.png" width="20%"><br>Politiscales</h1>
<p align="center"><b><a href="https://crowdin.com/project/repolitiscales" target="_blank">Help us to translate Politiscales on Crowdin!</a><br></b></p>

**Politiscales** is a political test using 8 ideological values to help you know approximately where you belong to in the political field, or simply to share your profile with your friends. This internet website was an initiative of *“Radicalisé·e·s sur Internet”* which is freely inspired by 8values.
In mid-2020, Politiscales was stopped, so it is now time to fork and enhance the project!

## Roadmap
- [x] Enable localization:
  - [x] Of questions
  - [x] Of static texts
  - [x] Of metadatas
  - [ ] Import the different translations from PolitiScales webarchive (🇮🇹/🇪🇸 done)
  - [ ] Fix original texts errors and typos
- [x] Set date seed to questions shuffle
- [ ] Enhance SEO (for a better localized integration)
- [ ] Make the project structure better and minify third-party libraries
- [x] Create a Crowdin about the project
- [ ] Rewrite of some weird questions
- [x] Add statistics based on consent
