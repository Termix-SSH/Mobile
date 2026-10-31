import { formatFingerprint } from "@/screens/dialogs/HostKeyVerificationDialog";

test("server hex fingerprints get colons, phone SHA256 ones stay as printed", () => {
  expect(formatFingerprint("abcd01")).toBe("ab:cd:01");
  expect(formatFingerprint("SHA256:But9amnuGeX733SQ")).toBe(
    "SHA256:But9amnuGeX733SQ",
  );
});
