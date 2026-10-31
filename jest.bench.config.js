/** @type {import('jest').Config} */
const base = require("./jest.config");

module.exports = {
  ...base,
  testMatch: ["<rootDir>/bench/**/*.bench.ts?(x)"],
  testTimeout: 120000,
};
