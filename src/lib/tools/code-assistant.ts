import { z } from 'zod';
import * as acorn from 'acorn';
import type { ToolDefinition } from './types';

/**
 * Static analysis only: the code is PARSED, never executed. Parsing uses acorn, which does
 * not evaluate code. Other languages get guidance from the model rather than tool output.
 */
const inputSchema = z.object({
  action: z.enum(['static_analysis']),
  language: z.enum(['javascript', 'python', 'other']).default('javascript'),
  code: z.string().min(1).max(20000),
});

export interface Finding {
  severity: 'error' | 'warning' | 'info';
  line: number;
  message: string;
}

export function analyzeJavaScript(code: string): Finding[] {
  const findings: Finding[] = [];
  let ast: acorn.Program | null = null;
  for (const sourceType of ['module', 'script'] as const) {
    try {
      ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType, locations: true, allowHashBang: true });
      break;
    } catch (err) {
      if (sourceType === 'script') {
        const e = err as { message: string; loc?: { line: number } };
        findings.push({ severity: 'error', line: e.loc?.line ?? 1, message: `Syntax error: ${e.message}` });
        return findings;
      }
    }
  }
  if (!ast) return findings;

  const walk = (node: any, parent: any) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'eval') {
      findings.push({ severity: 'warning', line: node.loc.start.line, message: 'Use of eval() can execute arbitrary code.' });
    }
    if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'Function') {
      findings.push({ severity: 'warning', line: node.loc.start.line, message: 'new Function() evaluates strings as code.' });
    }
    if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression' && node.left.property?.name === 'innerHTML') {
      findings.push({ severity: 'warning', line: node.loc.start.line, message: 'Assigning innerHTML can cause XSS if the value is untrusted.' });
    }
    if (node.type === 'VariableDeclaration' && node.kind === 'var') {
      findings.push({ severity: 'info', line: node.loc.start.line, message: 'Prefer let/const over var.' });
    }
    if (node.type === 'BinaryExpression' && (node.operator === '==' || node.operator === '!=')) {
      findings.push({ severity: 'info', line: node.loc.start.line, message: `Prefer strict equality (${node.operator === '==' ? '===' : '!=='}).` });
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => walk(c, node));
      else if (v && typeof v === 'object' && 'type' in v) walk(v, node);
    }
    void parent;
  };
  walk(ast, null);
  return findings.slice(0, 50);
}

export const codeAssistantTool: ToolDefinition<typeof inputSchema> = {
  name: 'code_assistant',
  title: 'Code assistant',
  description:
    'Static analysis of a JavaScript snippet: syntax errors and common risk patterns (eval, innerHTML, var, loose equality). Code is parsed only and never executed.',
  permission: 'read',
  inputSchema,
  timeoutMs: 3000,
  requiresApproval: () => false,
  async execute(input) {
    if (input.language !== 'javascript') {
      return {
        data: { supported: false, language: input.language, findings: [] },
        summary: `Static analysis is available for JavaScript only`,
      };
    }
    const findings = analyzeJavaScript(input.code);
    const errors = findings.filter((f) => f.severity === 'error').length;
    return {
      data: { supported: true, language: 'javascript', errors, findings },
      summary: errors ? `${errors} syntax error(s) found` : `${findings.length} finding(s)`,
    };
  },
};
