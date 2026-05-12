type Resolver = (alias: string) => number;

const functions: Record<string, (...values: number[]) => number> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  ceil: Math.ceil,
  clamp: (value, min, max) => Math.min(Math.max(value, min), max),
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  log: Math.log,
  max: (...values) => Math.max(...values),
  min: (...values) => Math.min(...values),
  pow: Math.pow,
  round: Math.round,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
};

export function isGraphMathExpression(value: string) {
  return parseGraphMathExpression(value) !== null;
}

export function isPotentialGraphMathExpression(value: string) {
  return /^[\sA-Za-z0-9_.,+\-*/%^()]*$/.test(value);
}

export function getGraphMathExpressionAliases(value: string) {
  const aliases = new Set<string>();
  const parsed = parseGraphMathExpression(value, (alias) => {
    aliases.add(alias);
    return 1;
  });
  return parsed === null ? [] : [...aliases];
}

export function evaluateGraphMathExpression(
  value: string,
  variables: Record<string, number>,
) {
  return parseGraphMathExpression(value, (alias) => variables[alias] ?? NaN);
}

function parseGraphMathExpression(value: string, resolver: Resolver = () => 1) {
  try {
    const parser = new GraphMathExpressionParser(value, resolver);
    const result = parser.parseExpression();
    parser.skipWhitespace();
    return parser.done() && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

class GraphMathExpressionParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly resolve: Resolver,
  ) {}

  parseExpression(): number {
    return this.parseAdditive();
  }

  skipWhitespace() {
    while (/\s/.test(this.peek())) this.index += 1;
  }

  done() {
    return this.index >= this.source.length;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (true) {
      this.skipWhitespace();
      if (this.consume("+")) value += this.parseMultiplicative();
      else if (this.consume("-")) value -= this.parseMultiplicative();
      else return value;
    }
  }

  private parseMultiplicative(): number {
    let value = this.parsePower();
    while (true) {
      this.skipWhitespace();
      if (this.consume("*")) {
        if (this.consume("*")) {
          this.index -= 2;
          return value;
        }
        value *= this.parsePower();
      } else if (this.consume("/")) {
        const right = this.parsePower();
        value = right === 0 ? 0 : value / right;
      } else if (this.consume("%")) {
        const right = this.parsePower();
        value = right === 0 ? 0 : value % right;
      } else return value;
    }
  }

  private parsePower(): number {
    const base = this.parseUnary();
    this.skipWhitespace();
    if (this.consume("**") || this.consume("^"))
      return Math.pow(base, this.parsePower());
    return base;
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.consume("+")) return this.parseUnary();
    if (this.consume("-")) return -this.parseUnary();
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    if (this.consume("(")) {
      const value = this.parseExpression();
      if (!this.consume(")")) throw new Error("Expected closing paren.");
      return value;
    }
    const number = this.readNumber();
    if (number !== null) return number;
    const identifier = this.readIdentifier();
    if (!identifier) throw new Error("Expected expression.");
    if (identifier === "input") {
      if (!this.consume(".")) throw new Error("Expected input alias.");
      const alias = this.readIdentifier();
      if (!alias) throw new Error("Expected input alias.");
      return this.resolve(alias);
    }
    if (identifier === "pi") return Math.PI;
    if (identifier === "e") return Math.E;
    this.skipWhitespace();
    if (!this.consume("("))
      throw new Error(`Unknown identifier ${identifier}.`);
    const args: number[] = [];
    this.skipWhitespace();
    if (!this.consume(")")) {
      while (true) {
        args.push(this.parseExpression());
        this.skipWhitespace();
        if (this.consume(")")) break;
        if (!this.consume(",")) throw new Error("Expected comma.");
      }
    }
    const fn = functions[identifier];
    if (!fn) throw new Error(`Unknown function ${identifier}.`);
    return fn(...args);
  }

  private readNumber() {
    this.skipWhitespace();
    const match = this.source
      .slice(this.index)
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) return null;
    this.index += match[0].length;
    return Number(match[0]);
  }

  private readIdentifier() {
    this.skipWhitespace();
    const match = this.source
      .slice(this.index)
      .match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!match) return null;
    this.index += match[0].length;
    return match[0];
  }

  private consume(token: string) {
    this.skipWhitespace();
    if (!this.source.startsWith(token, this.index)) return false;
    this.index += token.length;
    return true;
  }

  private peek() {
    return this.source[this.index] ?? "";
  }
}
