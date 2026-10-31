import {
  extractSnippetInputs,
  hasSnippetInputs,
  resolveSnippetContent,
} from "@/features/snippets/variables";

const host = { ip: "10.0.0.1", username: "root", port: 22, name: "db" };

test("fills host variables in both spellings and leaves look-alikes", () => {
  expect(
    resolveSnippetContent("ssh ${USER}@$HOST -p $PORT # $NAME $HOSTNAME", host),
  ).toBe("ssh root@10.0.0.1 -p 22 # db $HOSTNAME");
});

test("inputs keep their label and order, each once", () => {
  expect(
    extractSnippetInputs("cp ${INPUT_1:Source} $INPUT_2 $INPUT_1"),
  ).toEqual([
    { key: "INPUT_1", label: "Source" },
    { key: "INPUT_2", label: "Input 2" },
  ]);
  expect(hasSnippetInputs("echo $INPUT_10")).toBe(true);
  expect(hasSnippetInputs("echo $INPUT_X")).toBe(false);
});

test("values are never scanned again", () => {
  expect(
    resolveSnippetContent("echo $INPUT_1", host, { INPUT_1: "$INPUT_2 $HOST" }),
  ).toBe("echo $INPUT_2 $HOST");
});

test("a missing input stays as written", () => {
  expect(resolveSnippetContent("echo $INPUT_3", null)).toBe("echo $INPUT_3");
});
