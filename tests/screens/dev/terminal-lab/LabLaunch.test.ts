import { labRouteFromUrl } from "@/screens/dev/terminal-lab/LabLaunch";

test("lab links become routes with their query", () => {
  expect(
    labRouteFromUrl("termix-mobile://dev/terminal-lab?engine=xterm&auto=1"),
  ).toBe("/dev/terminal-lab?engine=xterm&auto=1");
  expect(labRouteFromUrl("termix-mobile://dev/terminal-lab")).toBe(
    "/dev/terminal-lab",
  );
});

test("anything else is ignored", () => {
  expect(labRouteFromUrl(null)).toBeNull();
  expect(labRouteFromUrl("")).toBeNull();
  expect(labRouteFromUrl("termix-mobile://widget/open")).toBeNull();
  expect(labRouteFromUrl("https://example.com/dev/terminal-lab")).toBeNull();
});
