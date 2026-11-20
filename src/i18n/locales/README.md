# Translations

Termix Mobile is translated into 41 languages. Anyone can help, and you don't need to know the code.

## How it works

- `en.json` holds the English text. It is the only file the app's code is written against.
- `translated/` has one file per language, like `de_DE.json` for German.
- When `en.json` changes on a dev branch, and again before every app build, a workflow translates the new and changed strings into every language with the Termix LLM server, using the translator in [Termix-Registry](https://github.com/Termix-SSH/Termix-Registry/tree/main/translate).
- `translations-lock.json` tracks which English text each translation was made from. Don't edit it by hand.

## Fix a translation

1. Open your language's file in `translated/`.
2. Find the key (the same one as in `en.json`) and change the text.
3. Keep anything in double braces, like `{{count}}` or `{{name}}`, exactly as it is.
4. Open a pull request.

A string you fixed is kept until its English text changes.

## Add a language

1. Add a line for it to `languages.json` here, with its code, file name, English name and its own name. For example:
   `{ "code": "is", "file": "is_IS", "name": "Icelandic", "label": "Íslenska" }`
2. Add the same line to `translate/languages.json` in [Termix-Registry](https://github.com/Termix-SSH/Termix-Registry/tree/main/translate), so the translator knows it. That is a separate pull request.
3. Run `node scripts/i18n-bundles.mjs` from the repo root. It creates the empty language file and adds it to the app.
4. Open a pull request. Once it is merged, the workflow fills in the translations. You can then check them and fix what reads wrong.

The new language shows up under Settings | Appearance | Language, and the app picks it on its own when the phone is set to it.

## For developers

Import `t` from `@/i18n` and only add English text to `en.json`. Plurals use `_one` and `_other` keys with a `count`, like `"hostCount_one": "{{count}} host"`. Never edit the files in `translated/` when you add a string.
