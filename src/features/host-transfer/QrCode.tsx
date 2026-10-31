import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { encode } from "uqr";

/** The squares of a QR code as one SVG path, a module per unit. */
export function qrPath(matrix: boolean[][]): string {
  let d = "";
  matrix.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`;
    });
  });
  return d;
}

export function qrMatrix(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: 2 }).data;
}

/** Always black on white, so every scanner can read it in any theme. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const path = useMemo(() => qrPath(matrix), [matrix]);
  return (
    <View
      style={{ width: size, height: size, backgroundColor: "#ffffff" }}
      accessibilityLabel="QR code"
      accessibilityRole="image"
    >
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${matrix.length} ${matrix.length}`}
      >
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}
