import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { askSudo } from "@/core/exec/sudo";
import { SudoPromptHost } from "@/screens/exec/SudoPromptHost";

jest.mock("@/ui", () => {
  const { Text, Pressable, View } = jest.requireActual("react-native");
  return {
    PromptSheet: ({ visible, title, description, onSubmit, onCancel }: any) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          <Text>{description}</Text>
          <Pressable onPress={() => onSubmit("pw")}>
            <Text>submit</Text>
          </Pressable>
          <Pressable onPress={onCancel}>
            <Text>cancel</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

test("asks once and answers with what was typed", async () => {
  await render(<SudoPromptHost />);
  let answer: Promise<string | null> = Promise.resolve(null);
  await act(async () => {
    answer = askSudo({
      hostName: "web",
      reason: "Restart nginx",
      retry: false,
    });
  });
  expect(screen.getByText(/Restart nginx on web needs root/)).toBeTruthy();
  fireEvent.press(screen.getByText("submit"));
  await expect(answer).resolves.toBe("pw");
  expect(screen.queryByText("Sudo password")).toBeNull();
});

test("a wrong password says so, and cancel answers null", async () => {
  await render(<SudoPromptHost />);
  let answer: Promise<string | null> = Promise.resolve("x");
  await act(async () => {
    answer = askSudo({ hostName: "web", retry: true });
  });
  expect(screen.getByText(/That password was wrong/)).toBeTruthy();
  fireEvent.press(screen.getByText("cancel"));
  await expect(answer).resolves.toBeNull();
});
