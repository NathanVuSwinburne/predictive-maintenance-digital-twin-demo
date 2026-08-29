/**
 * Row-wise formulas for calculated features.
 *
 * The production build sends a formula to a whitelisted evaluator in Python. The demo has
 * no backend, so the same grammar is parsed and evaluated here: shunting-yard to RPN,
 * then a stack machine. Anything outside the whitelist is a parse error rather than a
 * silently different answer.
 */

import type { DerivedFeatureRecipe } from "@/lib/demo-mlops/types";

export const FORMULA_FUNCTIONS = [
  "abs", "ceil", "clip", "cos", "exp", "floor", "log", "log10",
  "max", "min", "round", "sin", "sqrt", "tan",
] as const;

const FORMULA_CONSTANTS: Record<string, number> = { e: Math.E, pi: Math.PI };

const QUOTED_NAME = /"([^"]*)"|'([^']*)'/g;

/** How a column has to be written inside a formula. Real headers look like `Torque [Nm]`. */
export function quoteColumn(name: string): string {
  return `"${name.replace(/"/g, "")}"`;
}

type FormulaParts = {
  columns: string[];
  functions: string[];
  /** A quote was opened and never closed, so the name after it is still being typed. */
  unterminatedQuote: boolean;
};

/**
 * Split a formula into the columns it reads and the functions it calls. Quoted names are
 * lifted out first so the words inside them are never mistaken for separate identifiers.
 */
export function readFormula(expression: string): FormulaParts {
  const columns = new Set<string>();
  const functions = new Set<string>();
  const withoutQuoted = expression.replace(QUOTED_NAME, (_match, double, single) => {
    const name = ((double ?? single) as string).trim();
    if (name) columns.add(name);
    return " ";
  });
  const stray = withoutQuoted.search(/["']/);
  const scanned = stray === -1 ? withoutQuoted : withoutQuoted.slice(0, stray);
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*(\()?/g;
  let match = pattern.exec(scanned);
  while (match) {
    const [, identifier, isCall] = match;
    if (isCall) functions.add(identifier);
    else if (!(identifier in FORMULA_CONSTANTS)) columns.add(identifier);
    match = pattern.exec(scanned);
  }
  return { columns: [...columns], functions: [...functions], unterminatedQuote: stray !== -1 };
}

/** Letters and digits only, so spacing and punctuation stop separating near-matches. */
function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The column the user most likely meant. The common miss is a half-named column:
 * `Torque` typed for `Torque [Nm]`, so a prefix counts, and so does a spacing difference.
 */
function nearestColumn(name: string, availableColumns: string[]): string | undefined {
  const wanted = fold(name);
  if (!wanted) return undefined;
  return (
    availableColumns.find((column) => fold(column) === wanted) ??
    (wanted.length >= 2
      ? availableColumns.find((column) => fold(column).startsWith(wanted))
      : undefined) ??
    availableColumns.find((column) =>
      column.toLowerCase().split(/[\s_[\]()]+/).includes(name.toLowerCase()),
    )
  );
}

export function derivedFeatureProblem(
  feature: DerivedFeatureRecipe,
  availableColumns: string[],
): string | null {
  const name = feature.name.trim();
  const expression = feature.expression.trim();
  if (!name || !expression) return null;
  if (name.includes('"') || name.includes("'")) return "A name cannot contain quote marks.";
  if (availableColumns.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
    return `This machine already has a column called ${name}.`;
  }

  const { columns, functions, unterminatedQuote } = readFormula(expression);
  if (unterminatedQuote) {
    return "A quoted column name is still open; close it with a matching quote mark.";
  }
  const unknownFunction = functions.find(
    (item) => !(FORMULA_FUNCTIONS as readonly string[]).includes(item),
  );
  if (unknownFunction) {
    return `There is no ${unknownFunction} function. You can use: ${FORMULA_FUNCTIONS.join(", ")}.`;
  }
  const unknownColumn = columns.find((column) => !availableColumns.includes(column));
  if (unknownColumn) {
    const suggestion = nearestColumn(unknownColumn, availableColumns);
    return suggestion
      ? `This machine has no column called ${unknownColumn}. Did you mean ${quoteColumn(suggestion)}?`
      : `This machine has no column called ${unknownColumn}. Click one of the columns below to put it in.`;
  }
  if (columns.length === 0) {
    return "A formula has to read at least one column, or it is the same number on every row.";
  }
  try {
    compileFormula(expression);
  } catch (error) {
    return error instanceof Error ? error.message : "This formula cannot be read.";
  }
  return null;
}

export function isDerivedFeatureComplete(feature: DerivedFeatureRecipe): boolean {
  return Boolean(feature.name.trim() && feature.expression.trim());
}

export function isDerivedFeatureSendable(
  feature: DerivedFeatureRecipe,
  availableColumns: string[],
): boolean {
  return (
    isDerivedFeatureComplete(feature) && derivedFeatureProblem(feature, availableColumns) === null
  );
}

// --- evaluation -------------------------------------------------------------------

type Token =
  | { kind: "number"; value: number }
  | { kind: "column"; name: string }
  | { kind: "function"; name: string }
  | { kind: "operator"; symbol: string }
  | { kind: "comma" }
  | { kind: "paren"; symbol: "(" | ")" };

const OPERATORS: Record<string, { precedence: number; rightAssociative?: boolean }> = {
  "u-": { precedence: 5, rightAssociative: true },
  "**": { precedence: 4, rightAssociative: true },
  "*": { precedence: 3 },
  "/": { precedence: 3 },
  "//": { precedence: 3 },
  "%": { precedence: 3 },
  "+": { precedence: 2 },
  "-": { precedence: 2 },
};

const ARITY: Record<string, [number, number]> = {
  abs: [1, 1], ceil: [1, 1], cos: [1, 1], exp: [1, 1], floor: [1, 1],
  log: [1, 1], log10: [1, 1], round: [1, 1], sin: [1, 1], sqrt: [1, 1], tan: [1, 1],
  clip: [3, 3], max: [2, 2], min: [2, 2],
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const character = expression[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      const end = expression.indexOf(character, index + 1);
      if (end === -1) throw new Error("A quoted column name is still open.");
      tokens.push({ kind: "column", name: expression.slice(index + 1, end).trim() });
      index = end + 1;
      continue;
    }
    if (/[0-9]/.test(character) || (character === "." && /[0-9]/.test(expression[index + 1] ?? ""))) {
      const match = /^[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?/.exec(expression.slice(index));
      if (!match) throw new Error("That number cannot be read.");
      tokens.push({ kind: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expression.slice(index));
      const identifier = match ? match[0] : character;
      index += identifier.length;
      const rest = expression.slice(index).trimStart();
      if (rest.startsWith("(")) tokens.push({ kind: "function", name: identifier });
      else if (identifier in FORMULA_CONSTANTS) {
        tokens.push({ kind: "number", value: FORMULA_CONSTANTS[identifier] });
      } else tokens.push({ kind: "column", name: identifier });
      continue;
    }
    const pair = expression.slice(index, index + 2);
    if (pair === "**" || pair === "//") {
      tokens.push({ kind: "operator", symbol: pair });
      index += 2;
      continue;
    }
    if ("+-*/%".includes(character)) {
      tokens.push({ kind: "operator", symbol: character });
      index += 1;
      continue;
    }
    if (character === "(" || character === ")") {
      tokens.push({ kind: "paren", symbol: character });
      index += 1;
      continue;
    }
    if (character === ",") {
      tokens.push({ kind: "comma" });
      index += 1;
      continue;
    }
    throw new Error(`${character} cannot be used in a formula.`);
  }
  return tokens;
}

export type CompiledFormula = {
  columns: string[];
  evaluate: (row: Record<string, unknown>) => number | null;
};

/** Shunting-yard: infix tokens to a reverse-polish program, compiled once per formula. */
export function compileFormula(expression: string): CompiledFormula {
  const tokens = tokenize(expression);
  const output: Token[] = [];
  const stack: Token[] = [];
  const argumentCounts: number[] = [];
  let previous: Token | null = null;

  for (const token of tokens) {
    if (token.kind === "number" || token.kind === "column") {
      output.push(token);
    } else if (token.kind === "function") {
      stack.push(token);
      argumentCounts.push(1);
    } else if (token.kind === "comma") {
      while (stack.length > 0 && stack[stack.length - 1].kind !== "paren") {
        output.push(stack.pop() as Token);
      }
      if (stack.length === 0) throw new Error("A comma is outside any function call.");
      argumentCounts[argumentCounts.length - 1] += 1;
    } else if (token.kind === "operator") {
      const unary =
        (token.symbol === "-" || token.symbol === "+") &&
        (previous === null ||
          previous.kind === "operator" ||
          previous.kind === "comma" ||
          (previous.kind === "paren" && previous.symbol === "("));
      const symbol = unary ? (token.symbol === "-" ? "u-" : "u+") : token.symbol;
      if (symbol === "u+") {
        previous = token;
        continue;
      }
      const definition = OPERATORS[symbol];
      if (!definition) throw new Error(`${token.symbol} cannot be used in a formula.`);
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.kind !== "operator") break;
        const topDefinition = OPERATORS[top.symbol];
        const shouldPop = definition.rightAssociative
          ? topDefinition.precedence > definition.precedence
          : topDefinition.precedence >= definition.precedence;
        if (!shouldPop) break;
        output.push(stack.pop() as Token);
      }
      stack.push({ kind: "operator", symbol });
    } else if (token.symbol === "(") {
      stack.push(token);
    } else {
      while (stack.length > 0 && stack[stack.length - 1].kind !== "paren") {
        output.push(stack.pop() as Token);
      }
      if (stack.length === 0) throw new Error("There is a closing bracket with no opening one.");
      stack.pop();
      const top = stack[stack.length - 1];
      if (top && top.kind === "function") {
        const count = argumentCounts.pop() ?? 1;
        const bounds = ARITY[top.name];
        if (bounds && (count < bounds[0] || count > bounds[1])) {
          const expected = bounds[0] === bounds[1] ? `${bounds[0]}` : `${bounds[0]}-${bounds[1]}`;
          throw new Error(`${top.name} takes ${expected} arguments.`);
        }
        output.push(stack.pop() as Token);
      }
    }
    previous = token;
  }
  while (stack.length > 0) {
    const top = stack.pop() as Token;
    if (top.kind === "paren") throw new Error("There is an opening bracket with no closing one.");
    output.push(top);
  }
  if (output.length === 0) throw new Error("This formula is empty.");

  const columns = [
    ...new Set(output.flatMap((token) => (token.kind === "column" ? [token.name] : []))),
  ];

  function evaluate(row: Record<string, unknown>): number | null {
    const values: number[] = [];
    for (const token of output) {
      if (token.kind === "number") {
        values.push(token.value);
      } else if (token.kind === "column") {
        const raw = row[token.name];
        if (raw === null || raw === undefined || raw === "") return null;
        const numeric = typeof raw === "boolean" ? Number(raw) : Number(raw);
        if (!Number.isFinite(numeric)) return null;
        values.push(numeric);
      } else if (token.kind === "operator") {
        if (token.symbol === "u-") {
          const value = values.pop();
          if (value === undefined) return null;
          values.push(-value);
          continue;
        }
        const right = values.pop();
        const left = values.pop();
        if (left === undefined || right === undefined) return null;
        switch (token.symbol) {
          case "+": values.push(left + right); break;
          case "-": values.push(left - right); break;
          case "*": values.push(left * right); break;
          case "/": if (right === 0) return null; values.push(left / right); break;
          case "//": if (right === 0) return null; values.push(Math.floor(left / right)); break;
          case "%": if (right === 0) return null; values.push(left % right); break;
          case "**": values.push(left ** right); break;
          default: return null;
        }
      } else if (token.kind === "function") {
        const bounds = ARITY[token.name] ?? [1, 1];
        const args: number[] = [];
        for (let index = 0; index < bounds[1]; index += 1) {
          const value = values.pop();
          if (value === undefined) return null;
          args.unshift(value);
        }
        const result = applyFunction(token.name, args);
        if (result === null) return null;
        values.push(result);
      }
    }
    const answer = values.pop();
    return answer !== undefined && Number.isFinite(answer) ? answer : null;
  }

  return { columns, evaluate };
}

function applyFunction(name: string, args: number[]): number | null {
  switch (name) {
    case "abs": return Math.abs(args[0]);
    case "ceil": return Math.ceil(args[0]);
    case "floor": return Math.floor(args[0]);
    case "round": return Math.round(args[0]);
    case "sqrt": return args[0] < 0 ? null : Math.sqrt(args[0]);
    case "exp": return Math.exp(args[0]);
    case "log": return args[0] <= 0 ? null : Math.log(args[0]);
    case "log10": return args[0] <= 0 ? null : Math.log10(args[0]);
    case "sin": return Math.sin(args[0]);
    case "cos": return Math.cos(args[0]);
    case "tan": return Math.tan(args[0]);
    case "max": return Math.max(args[0], args[1]);
    case "min": return Math.min(args[0], args[1]);
    case "clip": return Math.min(Math.max(args[0], args[1]), args[2]);
    default: return null;
  }
}
