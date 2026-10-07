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

Run the following command:

```sh
npm run start
```

This starts the Expo development server. Open it in Expo Go or a development build, and sign in to a Termix server. If you do not have one, see the [install docs](https://docs.termix.site/install).

## Making a change

1. **Fork the repository**: Click "Fork" at the top right of the [repository page](https://github.com/Termix-SSH/Mobile).
2. **Create a branch**:
   ```sh
   git checkout -b feature/my-new-feature
   ```
3. **Make your changes**.
4. **Commit your changes**:
   ```sh
   git commit -m "feat: add my new feature"
   ```
5. **Push to your fork**:
   ```sh
   git push origin feature/my-new-feature
   ```
6. **Open a pull request** with a clear description.

## Support

To report a bug or request a feature, open a [support ticket](https://github.com/Termix-SSH/Support/issues/new/choose). Please be as detailed as possible, preferably in English. You can also ask in the [Discord](https://discord.gg/jVQGdvHDrf) server.
