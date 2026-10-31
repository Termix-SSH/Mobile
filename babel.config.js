module.exports = function (api) {
  // Caches per environment, so release builds get their own config.
  const production = api.env("production");
  return {
    presets: ["babel-preset-expo", "nativewind/babel"],
    plugins: production
      ? // Release builds drop console output; the in app log keeps its lines.
        [["transform-remove-console", { exclude: ["error", "warn"] }]]
      : [],
  };
};
