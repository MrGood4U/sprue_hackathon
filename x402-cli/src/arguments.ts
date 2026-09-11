const booleanOptions = new Set(["yes", "dry-run", "include", "force", "help"]);
const shortOptions: Record<string, string> = {
  X: "method",
  H: "header",
  d: "data",
  o: "output",
  y: "yes",
  h: "help",
};

export interface ParsedArguments {
  positionals: string[];
  options: Map<string, string[]>;
}

export function parseArguments(tokens: readonly string[]): ParsedArguments {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "--") {
      positionals.push(...tokens.slice(index + 1));
      break;
    }
    if (!token.startsWith("-") || token === "-") {
      positionals.push(token);
      continue;
    }
    const long = token.startsWith("--");
    const raw = long ? token.slice(2) : token.slice(1);
    const separator = raw.indexOf("=");
    const rawName = separator >= 0 ? raw.slice(0, separator) : raw;
    const name = long ? rawName : shortOptions[rawName];
    if (!name) throw new Error(`Unknown option: ${token}`);
    const inlineValue = separator >= 0 ? raw.slice(separator + 1) : null;
    const values = options.get(name) ?? [];
    if (booleanOptions.has(name)) {
      if (inlineValue !== null) throw new Error(`Option --${name} does not take a value.`);
      values.push("true");
    } else {
      const value = inlineValue ?? tokens[index + 1];
      if (value === undefined || (inlineValue === null && value.startsWith("-"))) {
        throw new Error(`Option --${name} requires a value.`);
      }
      if (inlineValue === null) index += 1;
      values.push(value);
    }
    options.set(name, values);
  }
  return {positionals, options};
}

export function option(args: ParsedArguments, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

export function options(args: ParsedArguments, name: string): string[] {
  return args.options.get(name) ?? [];
}

export function flag(args: ParsedArguments, name: string): boolean {
  return args.options.has(name);
}
