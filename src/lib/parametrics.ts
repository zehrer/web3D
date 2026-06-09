import type { ParametricFieldKey, PartNode, ProjectDocument, ProjectVariable, Vector3Like } from "../types/model";

type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "comma"; value: "," };

export type ExpressionResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

const FUNCTIONS: Record<string, (values: number[]) => number> = {
  abs: ([value]) => Math.abs(value),
  ceil: ([value]) => Math.ceil(value),
  floor: ([value]) => Math.floor(value),
  max: (values) => Math.max(...values),
  min: (values) => Math.min(...values),
  round: ([value]) => Math.round(value),
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      index += 1;
      while (index < expression.length && /[0-9.]/.test(expression[index])) index += 1;
      const raw = expression.slice(start, index);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number "${raw}"`);
      tokens.push({ kind: "number", value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index])) index += 1;
      tokens.push({ kind: "identifier", value: expression.slice(start, index) });
      continue;
    }

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ kind: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", value: char });
      index += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({ kind: "comma", value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected character "${char}"`);
  }

  return tokens;
}

class ExpressionParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly variables: Map<string, number>,
  ) {}

  parse(): number {
    const value = this.parseAdditive();
    if (this.peek()) throw new Error("Unexpected token at end of expression");
    return value;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (this.matchOperator("+") || this.matchOperator("-")) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseMultiplicative(): number {
    let value = this.parseUnary();
    while (this.matchOperator("*") || this.matchOperator("/")) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      if (operator === "/" && right === 0) throw new Error("Division by zero");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  private parseUnary(): number {
    if (this.matchOperator("+")) return this.parseUnary();
    if (this.matchOperator("-")) return -this.parseUnary();
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.advance();
    if (!token) throw new Error("Unexpected end of expression");

    if (token.kind === "number") return token.value;

    if (token.kind === "identifier") {
      if (this.matchParen("(")) {
        const args: number[] = [];
        if (!this.matchParen(")")) {
          do {
            args.push(this.parseAdditive());
          } while (this.matchComma());
          this.consumeParen(")");
        }
        const fn = FUNCTIONS[token.value];
        if (!fn) throw new Error(`Unknown function "${token.value}"`);
        return fn(args);
      }

      const value = this.variables.get(token.value);
      if (value === undefined) throw new Error(`Unknown variable "${token.value}"`);
      return value;
    }

    if (token.kind === "paren" && token.value === "(") {
      const value = this.parseAdditive();
      this.consumeParen(")");
      return value;
    }

    throw new Error("Expected number, variable, function, or parenthesized expression");
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private previous(): Token {
    return this.tokens[this.index - 1];
  }

  private advance(): Token | undefined {
    return this.tokens[this.index++];
  }

  private matchOperator(value: "+" | "-" | "*" | "/"): boolean {
    const token = this.peek();
    if (token?.kind !== "operator" || token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private matchParen(value: "(" | ")"): boolean {
    const token = this.peek();
    if (token?.kind !== "paren" || token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private consumeParen(value: "(" | ")"): void {
    if (!this.matchParen(value)) throw new Error(`Expected "${value}"`);
  }

  private matchComma(): boolean {
    const token = this.peek();
    if (token?.kind !== "comma") return false;
    this.index += 1;
    return true;
  }
}

export function evaluateExpression(expression: string, variables: ProjectVariable[]): ExpressionResult {
  try {
    const variableValues = new Map(variables.map((variable) => [variable.name, variable.valueMm]));
    const value = new ExpressionParser(tokenize(expression), variableValues).parse();
    if (!Number.isFinite(value)) return { ok: false, error: "Expression did not produce a finite number" };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid expression" };
  }
}

function setField(part: PartNode, field: ParametricFieldKey, value: number): PartNode {
  const [section, axis] = field.split(".") as ["size" | "position" | "rotation", keyof Vector3Like];
  return {
    ...part,
    [section]: {
      ...part[section],
      [axis]: value,
    },
  };
}

export function applyProjectParamBindings(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    parts: project.parts.map((part) => {
      const bindings = part.paramBindings;
      if (!bindings) return part;

      return (Object.entries(bindings) as Array<[ParametricFieldKey, string]>).reduce((nextPart, [field, expression]) => {
        const trimmed = expression.trim();
        if (!trimmed) return nextPart;
        const result = evaluateExpression(trimmed, project.variables);
        return result.ok ? setField(nextPart, field, result.value) : nextPart;
      }, part);
    }),
  };
}
