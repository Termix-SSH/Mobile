/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/tests/**/*.test.ts?(x)"],
  setupFiles: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^@/modules/(.*)$": "<rootDir>/modules/$1",
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Used by npm run test:coverage. A folder that drops below its floor fails.
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "modules/*/index.ts",
    "modules/*/src/**/*.ts",
  ],
  coverageThreshold: {
    "./src/core/data/": { lines: 92, branches: 83 },
    "./src/core/db/": { lines: 88, branches: 85 },
    "./src/core/sync/": { lines: 89, branches: 76 },
    "./src/core/transport/": { lines: 87, branches: 78 },
    "./src/core/exec/": { lines: 91, branches: 74 },
    "./src/core/hosts/": { lines: 93, branches: 87 },
    "./modules/termix-ssh/": { lines: 92, branches: 80 },
    "./src/features/file-manager/backend/": { lines: 82, branches: 70 },
    "./src/features/docker/backend/": { lines: 91, branches: 72 },
    "./src/features/services/backend/": { lines: 97, branches: 74 },
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|lucide-react-native|nativewind|react-native-css-interop|sonner-native|@noble/.*|uqr|standard-navigation|@termix-ssh/.*)",
  ],
};
