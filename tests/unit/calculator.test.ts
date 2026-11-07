import { describe, expect, it } from 'vitest';
import { evaluateExpression } from '@/lib/tools/calculator';

describe('calculator', () => {
  it('evaluates arithmetic with precedence and parentheses', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpression('2 ^ 3')).toBe(8);
    expect(evaluateExpression('-5 + 2')).toBe(-3);
  });

  it('supports common math functions and constants', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4);
    expect(evaluateExpression('max(1, 9, 3)')).toBe(9);
    expect(evaluateExpression('round(2.6)')).toBe(3);
  });

  it('rejects code injection attempts', () => {
    const attacks = [
      'process.exit(1)',
      'constructor.constructor("return process")()',
      '__proto__',
      'require("fs")',
      '1; console.log(1)',
      'globalThis',
    ];
    for (const a of attacks) expect(() => evaluateExpression(a)).toThrow();
  });

  it('rejects division by zero and non-finite results', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow();
  });

  it('rejects excessively long input', () => {
    expect(() => evaluateExpression('1+'.repeat(2000) + '1')).toThrow();
  });
});
