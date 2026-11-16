import { CORNER_PAD, cornerPad } from "@/ui/corner-pad";

// iPhone Duo inner screen held open, 951 points wide.
const width = 951;

test("a header in a rounded top corner keeps clear of it", () => {
  // The host list header at the top left, beside the sessions.
  expect(cornerPad({ x: 0, y: 24, width: 340 }, width, true)).toEqual({
    left: CORNER_PAD,
    right: 0,
  });
  // A full width header reaches both corners.
  expect(cornerPad({ x: 0, y: 24, width }, width, true)).toEqual({
    left: CORNER_PAD,
    right: CORNER_PAD,
  });
  // One right of the crease only reaches the right corner.
  expect(cornerPad({ x: 485, y: 24, width: 466 }, width, true)).toEqual({
    left: 0,
    right: CORNER_PAD,
  });
});

test("headers away from the corners keep their spacing", () => {
  // Beside a rail, so not at the window edge.
  expect(cornerPad({ x: 84, y: 24, width: 400 }, width, true)).toEqual({
    left: 0,
    right: 0,
  });
  // Lower down, where the corner has already curved away.
  expect(cornerPad({ x: 0, y: 300, width }, width, true)).toEqual({
    left: 0,
    right: 0,
  });
  // The square cornered outer screen, phones and tablets.
  expect(cornerPad({ x: 0, y: 24, width }, width, false)).toEqual({
    left: 0,
    right: 0,
  });
  expect(cornerPad(null, width, true)).toEqual({ left: 0, right: 0 });
});
