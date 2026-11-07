import { describe, expect, it } from 'vitest';
import { AGENT_MODE_IDS, AGENT_MODES, getMode } from '@/lib/agents/modes';
import { TOOL_REGISTRY, getToolDefinition, toolJsonSchema } from '@/lib/tools/registry';

describe('agent modes', () => {
  it('defines exactly the nine required modes', () => {
    expect([...AGENT_MODE_IDS].sort()).toEqual(['business', 'coding', 'data', 'document', 'general', 'multimodal', 'planner', 'research', 'writing'].sort());
  });

  it('gives every mode a prompt and a bounded temperature', () => {
    for (const id of AGENT_MODE_IDS) {
      const m = AGENT_MODES[id];
      expect(m.instructions.length).toBeGreaterThan(40);
      expect(m.temperature).toBeGreaterThanOrEqual(0);
      expect(m.temperature).toBeLessThanOrEqual(1);
    }
  });

  it('only grants tools that exist in the registry', () => {
    const known = new Set(TOOL_REGISTRY.map((t) => t.name));
    for (const id of AGENT_MODE_IDS) {
      for (const tool of AGENT_MODES[id].allowedTools) expect(known.has(tool), `${id} -> ${tool}`).toBe(true);
    }
  });

  it('falls back to general for unknown ids', () => {
    expect(getMode('does-not-exist').id).toBe('general');
  });

  it('the planner mode always plans first', () => {
    expect(AGENT_MODES.planner.alwaysPlan).toBe(true);
  });
});

describe('tool registry', () => {
  it('exposes the required tools', () => {
    const names = TOOL_REGISTRY.map((t) => t.name);
    for (const n of ['calculator', 'web_search', 'document_reader', 'data_analysis', 'code_assistant', 'datetime', 'notes', 'tasks', 'image_analysis']) {
      expect(names).toContain(n);
    }
  });

  it('produces JSON schemas for native tool calling', () => {
    const def = getToolDefinition('calculator');
    expect(def).toBeTruthy();
    const schema = toolJsonSchema(def!);
    expect(schema).toHaveProperty('type', 'object');
    expect(schema).toHaveProperty('properties.operation');
    expect(schema).not.toHaveProperty('oneOf');
  });

  it('does not allow tools with names that could collide with prototype keys', () => {
    expect(getToolDefinition('__proto__')).toBeUndefined();
    expect(getToolDefinition('constructor')).toBeUndefined();
  });
});
