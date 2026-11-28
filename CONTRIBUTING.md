# Contributing

Termix Mobile is the iOS and Android app for [Termix](https://github.com/Termix-SSH/Termix), self-hosted, plugin-based server management.

## Prerequisites

- [Node.js](https://nodejs.org/en/download/) (built with v24)
- [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [Git](https://git-scm.com/downloads)

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/Termix-SSH/Mobile
   ```
2. Install the dependencies:
   ```sh
   npm install
   ```

## Running the development server

```sh
npm run start
```

This starts the Expo development server. Open it in a development build, and sign in to a Termix server. If you do not have one, see the [install docs](https://docs.termix.site/install). Expo Go does not work, because the local database needs SQLCipher, which only a development build has.

## Theme and icons

Theme colors in `src/constants/theme.ts` are copied from the [Classic Themes](https://github.com/Termix-SSH/Plugin-Classic-Themes) plugin. Change them there first, then here. `npm test` checks the set is complete.

Every app icon, splash and status bar icon is built from `assets/brand/logo.svg`. After changing the logo or `scripts/icon-spec.cjs`, run:

```sh
npm run icons
npm test
```

## Local database

Each account has its own SQLite file, encrypted with SQLCipher. The tables are in `src/core/db/schema.ts` and mirror the server's sync rows. After changing the schema, run:

```sh
npm run db:generate
npm test
```

This writes a new migration to `drizzle/` and `src/core/db/migrations.ts`. Never edit a migration that has shipped. `npm test` fails when the two disagree.

## Server plugin pages

Server plugins with no phone version run in a web view. The page they run in is built from `scripts/plugin-host/` into `assets/plugin-host/host.js.html`, and every message between the app and the page is typed in `src/core/plugins/frame-protocol.ts`. After changing either, run:

```sh
npm run build:plugin-host
npm test
```

When a foldable screen bends across the page, the app sends `{ t: "fold", fold }`, where `fold` is `{ axis, start, end, active }` in the page's own CSS pixels (`axis` is `"vertical"` when the crease runs top to bottom, `start` and `end` bound the area to keep clear from the page's left or top edge, `active` is true while the screen is bent). It is sent again when the fold moves, bends, goes flat or turns, and with `fold: null` once it no longer crosses the page. Screens that don't fold never get it. The page sets:

- `--termix-fold-start`, `--termix-fold-end` and `--termix-fold-size` on `<html>`, in `px`
- `data-termix-fold="vertical"` or `"horizontal"` on `<html>`, plus `data-termix-fold-active` while bent
- `window.termixFold` to the latest `fold` or `null`, and a `termix:fold` event on `window` with it as `detail`

`start` and `end` are positions in the page's viewport, so they fit a layout that fills the page and does not scroll along the fold. A plugin can lay out two columns around the crease with CSS alone:

```css
html[data-termix-fold="vertical"] .columns {
  display: grid;
  grid-template-columns: var(--termix-fold-start) 1fr;
  column-gap: var(--termix-fold-size);
}
```

## Project layout

- `app/` holds routes only. Each route file imports a screen from `src/`.
- `src/core/` is the shared base: accounts, the API client per server, transports, the feature registry, the local database and repositories, storage and logging.
- `src/features/` holds one folder per feature. Each has a `register.tsx` that adds its tabs, host actions and settings to the registry. Screens read the registry and never check a feature by name.
- `src/screens/`, `src/ui/`, `src/contexts/` hold the app screens, UI parts and providers.
- `tests/` mirrors `src/` and runs with Jest.

## Store screenshots and previews

The Store Media workflow makes the App Store and Google Play screenshots and the App Store previews. It builds the app with `EXPO_PUBLIC_SHOWCASE=1`, which fills This device with sample hosts and fakes every connection, so no server is needed. Android emulators capture each screen on a phone and a tablet, and those same shots are used for both stores. The iOS simulator captures the iPhone Duo shots and, when asked, the preview videos (that build takes about an hour). Each shot is cropped below the status bar and above the home bar, put in a device frame with a caption in the dark theme, and saved as a `store-media` artifact. Upload them to App Store Connect and Google Play by hand.

The tooling lives in `store/`, a separate npm package:

```sh
cd store
npm ci
npm run capture -- --platform ios --device iphone-duo --app path/to/Termix.app   # needs a Mac
npm run capture -- --platform android --device android-phone --app app-release.apk
npm run render                                               # out/raw to out/final
npm run render -- --write-metadata                           # also fills fastlane/metadata/android
```

- What is captured and what is made from it: `store/devices.ts`
- Slide order and text: `store/captions.ts` (words between stars show in the accent color)
- App side: scenarios in `src/showcase/scenarios.ts`, sample data in `src/showcase/seed.ts`

A new scenario needs an entry in `SCENARIOS`, a capture in `CAPTURES` and a slide in `SLIDES`.

## Translations

All text in the app comes from `src/i18n/locales/en.json`. Other languages are translated automatically, and anyone can fix a translation or add a new language. See [src/i18n/locales/README.md](src/i18n/locales/README.md).

## Checks

```sh
npm run verify
```

This runs the type check, lint, format check and tests. `npm test` runs only the tests.

## Making a change

1. Fork the [repo](https://github.com/Termix-SSH/Mobile).
2. Create a branch:
   ```sh
   git checkout -b feature/my-new-feature
   ```
3. Make your changes.
4. Commit your changes:
   ```sh
   git commit -m "feat: add my new feature"
   ```
5. Push to your fork:
   ```sh
   git push origin feature/my-new-feature
   ```
6. Open a pull request with a clear description.

## Support

Bugs and ideas for the mobile app go in [this repo](https://github.com/Termix-SSH/Mobile/issues/new/choose). Add as much detail as you can, in English if possible. You can also ask in the [Discord](https://discord.gg/jVQGdvHDrf) server.
