import {stdin, stdout} from "node:process";
import {createInterface} from "node:readline/promises";

export async function promptLine(label: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(`${label} must be supplied through the documented environment variable in non-interactive mode.`);
  const reader = createInterface({input: stdin, output: stdout});
  try {
    return (await reader.question(label)).trim();
  } finally {
    reader.close();
  }
}

export async function promptSecret(label: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error(`${label} must be supplied through the documented environment variable in non-interactive mode.`);
  }
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string | Buffer) => {
      for (const character of String(chunk)) {
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u0003") return finish(new Error("Input cancelled."));
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };
    stdin.on("data", onData);
  });
}

export async function confirm(label: string): Promise<boolean> {
  const answer = (await promptLine(`${label} [y/N] `)).toLowerCase();
  return answer === "y" || answer === "yes";
}
