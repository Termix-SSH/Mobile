import fs from "node:fs";
import path from "node:path";

// Inside the anonymous View that draws, a bare `matrix` is View.getMatrix(),
// a fresh copy: scale and pan set on it are lost and the frame draws 1:1.
const kotlin = fs.readFileSync(
  path.join(
    __dirname,
    "../../..",
    "modules/termix-display/android/src/main/java/expo/modules/termixdisplay/TermixDisplayView.kt",
  ),
  "utf8",
);

const canvasView = kotlin.match(
  /private val canvasView = object : View\(context\) \{[\s\S]*?\n {2}\}\n/,
)?.[0];

test("the drawing view does not use View.matrix by mistake", () => {
  expect(canvasView).toBeDefined();
  expect(canvasView).toContain("override fun onDraw");
  expect(canvasView).not.toMatch(/\bmatrix\b/);
});

test("the frame is drawn with the scaled and panned matrix", () => {
  expect(kotlin).toMatch(/private val drawMatrix = Matrix\(\)/);
  expect(canvasView).toContain("drawMatrix.setScale(");
  expect(canvasView).toContain("drawMatrix.postTranslate(");
  expect(canvasView).toContain("canvas.drawBitmap(bmp, drawMatrix, paint)");
});
