import { describe, expect, it } from 'vitest';
import { parseToolRequest } from '@/lib/agents/json-protocol';

describe('JSON tool protocol', () => {
  it('parses a bare tool request', () => {
    expect(parseToolRequest('{"tool":"calculator","input":{"expression":"2+2"}}')).toEqual({ tool: 'calculator', input: { expression: '2+2' } });
  });

  it('parses a fenced tool request', () => {
    const text = '```json\n{"tool":"datetime","input":{}}\n```';
    expect(parseToolRequest(text)?.tool).toBe('datetime');
  });

  it('treats ordinary prose as a final answer', () => {
    expect(parseToolRequest('The answer is 4.')).toBeNull();
    expect(parseToolRequest('{"message":"no tool here"}')).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(parseToolRequest('{"tool":')).toBeNull();
  });
});
