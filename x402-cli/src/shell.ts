import {stdout} from "node:process";
import {CLI_NAME} from "./help.js";
import {promptLine} from "./io.js";

export const SHELL_BANNER = `Hedera x402 interactive client
Type "help" for the quick-start guide, "help request" for request examples,
"clear" to clear the screen, or "exit" to quit.
`;

export function tokenizeCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "single" | "double" | undefined;
  let tokenStarted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quote === "single") {
      if (character === "'") quote = undefined;
      else token += character;
      continue;
    }
    if (quote === "double") {
      if (character === '"') {
        quote = undefined;
        continue;
      }
      if (character === "\\" && (input[index + 1] === '"' || input[index + 1] === "\\")) {
        token += input[index + 1];
        index += 1;
        continue;
      }
      token += character;
      continue;
    }
    if (character === "'") {
      quote = "single";
      tokenStarted = true;
    } else if (character === '"') {
      quote = "double";
      tokenStarted = true;
    } else if (/\s/u.test(character)) {
      if (tokenStarted) {
        tokens.push(token);
        token = "";
        tokenStarted = false;
      }
    } else {
      token += character;
      tokenStarted = true;
    }
  }

  if (quote) throw new Error(`Unterminated ${quote} quote.`);
  if (tokenStarted) tokens.push(token);
  return tokens;
}

export interface InteractiveShellIo {
  readLine: (label: string) => Promise<string>;
  writeOutput: (value: string) => void;
  writeError: (value: string) => void;
  clear: () => void;
}

const defaultIo: InteractiveShellIo = {
  readLine: promptLine,
  writeOutput: (value) => stdout.write(value),
  writeError: (value) => process.stderr.write(value),
  clear: () => stdout.write("\u001b[2J\u001b[H"),
};

function withoutExecutablePrefix(arguments_: string[]): string[] {
  const first = arguments_[0]?.toLowerCase();
  return [CLI_NAME, `${CLI_NAME}.exe`, "hx402", "hx402.exe"].includes(first ?? "")
    ? arguments_.slice(1)
    : arguments_;
}

export async function runInteractiveShell(
  execute: (arguments_: string[]) => Promise<number>,
  io: InteractiveShellIo = defaultIo,
): Promise<void> {
  io.writeOutput(`${SHELL_BANNER}\n`);
  while (true) {
    let line: string;
    try {
      line = await io.readLine(`${CLI_NAME}> `);
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.message === "Input cancelled.")) {
        io.writeOutput("\n");
        return;
      }
      throw error;
    }

    let arguments_: string[];
    try {
      arguments_ = withoutExecutablePrefix(tokenizeCommandLine(line));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid command line.";
      io.writeError(`${CLI_NAME}: ${message}\n`);
      continue;
    }
    if (arguments_.length === 0) continue;

    const command = arguments_[0]!.toLowerCase();
    if (command === "exit" || command === "quit") return;
    if (command === "clear" || command === "cls") {
      io.clear();
      continue;
    }
    try {
      await execute(arguments_);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected failure.";
      io.writeError(`${CLI_NAME}: ${message}\n`);
    }
  }
}
