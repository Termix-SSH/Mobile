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

## Project layout

- `app/` holds routes only. Each route file imports a screen from `src/`.
- `src/core/` is the shared base: accounts, the API client per server, transports, the feature registry, the local database and repositories, storage and logging.
- `src/features/` holds one folder per feature. Each has a `register.tsx` that adds its tabs, host actions and settings to the registry. Screens read the registry and never check a feature by name.
- `src/screens/`, `src/ui/`, `src/contexts/` hold the app screens, UI parts and providers.
- `tests/` mirrors `src/` and runs with Jest.

## Store screenshots and previews

The Store Media workflow makes the App Store and Google Play screenshots and the App Store previews. It builds the app with `EXPO_PUBLIC_SHOWCASE=1`, which fills This device with sample hosts and fakes every connection, so no server is needed. It captures each screen on iPhone, iPad, iPhone Duo, an Android phone and an Android tablet, frames them in the app's theme with a short caption, and uploads a `store-media` artifact. Turn on the upload switches to send them to App Store Connect (the version open for edits) and Google Play.

The tooling lives in `store/`, a separate npm package:

```sh
cd store
npm ci
npm run capture -- --platform ios --app path/to/Termix.app   # needs a Mac
npm run capture -- --platform android --device android-phone --app app-release.apk
npm run render                                               # out/raw to out/final
npm run render -- --write-metadata                           # also fills fastlane/metadata/android
npm run upload -- --platform ios --dry-run
```

- Devices and sizes: `store/devices.ts`
- Slide order and text: `store/captions.ts`
- App side: scenarios in `src/showcase/scenarios.ts`, sample data in `src/showcase/seed.ts`

A new scenario needs an entry in `SCENARIOS`, a capture in `CAPTURES` and a slide in `SLIDES`.

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
