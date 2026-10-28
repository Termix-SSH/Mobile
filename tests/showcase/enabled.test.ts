const load = () => {
  let value = false;
  jest.isolateModules(() => {
    value = require("@/showcase/enabled").SHOWCASE;
  });
  return value;
};

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SHOWCASE;
});

test("off unless the build sets the flag", () => {
  delete process.env.EXPO_PUBLIC_SHOWCASE;
  expect(load()).toBe(false);
  process.env.EXPO_PUBLIC_SHOWCASE = "0";
  expect(load()).toBe(false);
  process.env.EXPO_PUBLIC_SHOWCASE = "1";
  expect(load()).toBe(true);
});
