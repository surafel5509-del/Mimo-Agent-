import { z } from 'zod';
import type { ToolDefinition } from './types';
import { ToolError } from './types';

/**
 * Safe arithmetic evaluator (recursive descent). It never uses eval/Function, so arbitrary
 * code cannot run. Supports + - * / % ^ **, parentheses, constants and a fixed function set,
 * plus postfix percent ("15% of 200" is handled by the `percent_of` operation or "of").
 */
const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: (x) => Math.sqrt(x),
  abs: (x) => Math.abs(x),
  round: (x, d = 0) => Number(Math.round(Number(`${x}e${d}`)) + 'e-' + d),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  log2: (x) => Math.log2(x),
  exp: (x) => Math.exp(x),
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  pow: (x, y) => x ** y,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const MAX_LEN = 500;

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' } | { t: 'comma' };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ToolError('invalid_input', `Invalid number near "${src.slice(i, i + 10)}".`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0].toLowerCase() });
      i += m[0].length;
      continue;
    }
    if (src.startsWith('**', i)) {
      out.push({ t: 'op', v: '^' });
      i += 2;
      continue;
    }
    if ('+-*/%^'.includes(c)) {
      out.push({ t: 'op', v: c });
    } else if (c === '(') out.push({ t: 'lp' });
    else if (c === ')') out.push({ t: 'rp' });
    else if (c === ',') out.push({ t: 'comma' });
    else throw new ToolError('invalid_input', `Unsupported character "${c}".`);
    i++;
  }
  return out;
}

export function evaluateExpression(expression: string): number {
  if (expression.length > MAX_LEN) throw new ToolError('invalid_input', `Expression is longer than ${MAX_LEN} characters.`);
  const normalized = expression.replace(/%\s*of\s*/gi, '%*'); // "15% of 200" → 15%*200
  const toks = tokenize(normalized);
  let pos = 0;
  let depth = 0;
  const peek = () => toks[pos];
  const eat = () => toks[pos++];

  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek()?.t === 'op' && ((peek() as any).v === '+' || (peek() as any).v === '-')) {
      const op = (eat() as any).v;
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };

  const parseTerm = (): number => {
    let v = parsePower();
    while (peek()?.t === 'op') {
      const op = (peek() as any).v as string;
      if (op !== '*' && op !== '/' && op !== '%') break;
      const next = toks[pos + 1];
      if (op === '%' && (!next || next.t === 'op' || next.t === 'rp' || next.t === 'comma')) {
        // postfix percent: 15% → 0.15
        eat();
        v = v / 100;
        continue;
      }
      eat();
      const r = parsePower();
      if (op === '*') v = v * r;
      else if (op === '/') {
        if (r === 0) throw new ToolError('invalid_input', 'Division by zero.');
        v = v / r;
      } else {
        if (r === 0) throw new ToolError('invalid_input', 'Modulo by zero.');
        v = v % r;
      }
    }
    return v;
  };

  const parsePower = (): number => {
    const base = parseUnary();
    if (peek()?.t === 'op' && (peek() as any).v === '^') {
      eat();
      return base ** parsePower();
    }
    return base;
  };

  const parseUnary = (): number => {
    if (peek()?.t === 'op' && ((peek() as any).v === '-' || (peek() as any).v === '+')) {
      const op = (eat() as any).v;
      const v = parseUnary();
      return op === '-' ? -v : v;
    }
    return parsePrimary();
  };

  const parsePrimary = (): number => {
    const tok = eat();
    if (!tok) throw new ToolError('invalid_input', 'The expression is incomplete.');
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'lp') {
      depth++;
      if (depth > 50) throw new ToolError('invalid_input', 'The expression is nested too deeply.');
      const v = parseExpr();
      if (!peek() || peek().t !== 'rp') throw new ToolError('invalid_input', 'Missing closing parenthesis.');
      eat();
      depth--;
      return v;
    }
    if (tok.t === 'id') {
      if (peek()?.t === 'lp') {
        const fn = FUNCS[tok.v];
        if (!fn) throw new ToolError('invalid_input', `Unknown function "${tok.v}".`);
        eat();
        const args: number[] = [];
        if (peek()?.t !== 'rp') {
          args.push(parseExpr());
          while (peek()?.t === 'comma') {
            eat();
            args.push(parseExpr());
          }
        }
        if (!peek() || peek().t !== 'rp') throw new ToolError('invalid_input', 'Missing closing parenthesis.');
        eat();
        return fn(...args);
      }
      if (tok.v in CONSTS) return CONSTS[tok.v];
      throw new ToolError('invalid_input', `Unknown name "${tok.v}".`);
    }
    throw new ToolError('invalid_input', 'Unexpected token in expression.');
  };

  const result = parseExpr();
  if (pos !== toks.length) throw new ToolError('invalid_input', 'Unexpected input after the expression.');
  if (!Number.isFinite(result)) throw new ToolError('invalid_input', 'The result is not a finite number.');
  return result;
}

const inputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('evaluate'), expression: z.string().min(1).max(MAX_LEN) }),
  z.object({ operation: z.literal('percent_of'), percent: z.number(), value: z.number() }),
  z.object({ operation: z.literal('percent_change'), from: z.number(), to: z.number() }),
  z.object({ operation: z.literal('add_percent'), value: z.number(), percent: z.number() }),
  z.object({ operation: z.literal('subtract_percent'), value: z.number(), percent: z.number() }),
]);

export const calculatorTool: ToolDefinition<typeof inputSchema> = {
  name: 'calculator',
  title: 'Calculator',
  description:
    'Evaluate arithmetic. operation=evaluate with an expression (supports + - * / % ^, parentheses, sqrt, abs, round, log, ln, min, max, pi, e; "15% of 200" works). Other operations: percent_of, percent_change, add_percent, subtract_percent.',
  permission: 'read',
  inputSchema,
  timeoutMs: 2000,
  requiresApproval: () => false,
  async execute(input) {
    let result: number;
    switch (input.operation) {
      case 'evaluate':
        result = evaluateExpression(input.expression);
        break;
      case 'percent_of':
        result = (input.percent / 100) * input.value;
        break;
      case 'percent_change':
        if (input.from === 0) throw new ToolError('invalid_input', 'Percent change from zero is undefined.');
        result = ((input.to - input.from) / Math.abs(input.from)) * 100;
        break;
      case 'add_percent':
        result = input.value * (1 + input.percent / 100);
        break;
      case 'subtract_percent':
        result = input.value * (1 - input.percent / 100);
        break;
    }
    const rounded = Math.round(result * 1e10) / 1e10;
    return {
      data: { operation: input.operation, result: rounded },
      summary: `${input.operation} = ${rounded}`,
    };
  },
};
