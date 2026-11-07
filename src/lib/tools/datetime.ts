import { z } from 'zod';
import type { ToolDefinition } from './types';
import { ToolError } from './types';

const UNITS = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'] as const;

/** Validates an IANA timezone identifier. */
export function assertTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    throw new ToolError('invalid_input', `Unknown timezone "${tz}". Use an IANA name such as Africa/Addis_Ababa.`);
  }
}

export function formatInZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function addUnits(date: Date, amount: number, unit: (typeof UNITS)[number]): Date {
  const d = new Date(date.getTime());
  switch (unit) {
    case 'minutes':
      d.setUTCMinutes(d.getUTCMinutes() + amount);
      break;
    case 'hours':
      d.setUTCHours(d.getUTCHours() + amount);
      break;
    case 'days':
      d.setUTCDate(d.getUTCDate() + amount);
      break;
    case 'weeks':
      d.setUTCDate(d.getUTCDate() + amount * 7);
      break;
    case 'months':
      d.setUTCMonth(d.getUTCMonth() + amount);
      break;
    case 'years':
      d.setUTCFullYear(d.getUTCFullYear() + amount);
      break;
  }
  return d;
}

const inputSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('now'), timezone: z.string().optional() }),
  z.object({ operation: z.literal('convert'), instant: z.string().min(1).max(40), timezone: z.string() }),
  z.object({
    operation: z.literal('add'),
    start: z.string().min(1).max(40),
    amount: z.number().int().min(-100000).max(100000),
    unit: z.enum(UNITS),
    timezone: z.string().optional(),
  }),
  z.object({
    operation: z.literal('diff'),
    from: z.string().min(1).max(40),
    to: z.string().min(1).max(40),
  }),
]);

function parseInstant(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ToolError('invalid_input', `"${value}" is not a recognised date/time.`);
  return d;
}

export const datetimeTool: ToolDefinition<typeof inputSchema> = {
  name: 'datetime',
  title: 'Date & time',
  description:
    'Timezone-aware date and time operations. operation=now (optional timezone), convert (instant + timezone), add (start + amount + unit minutes|hours|days|weeks|months|years), diff (from, to). Default timezone is the user\'s.',
  permission: 'read',
  inputSchema,
  timeoutMs: 2000,
  requiresApproval: () => false,
  async execute(input, ctx) {
    const tz = assertTimezone(('timezone' in input && input.timezone) || ctx.timezone);
    const now = new Date();
    switch (input.operation) {
      case 'now':
        return { data: { iso: now.toISOString(), local: formatInZone(now, tz), timezone: tz }, summary: `Current time in ${tz}` };
      case 'convert': {
        const d = parseInstant(input.instant);
        return { data: { iso: d.toISOString(), local: formatInZone(d, tz), timezone: tz }, summary: `Converted to ${tz}` };
      }
      case 'add': {
        const d = addUnits(parseInstant(input.start), input.amount, input.unit);
        return { data: { iso: d.toISOString(), local: formatInZone(d, tz), timezone: tz }, summary: `${input.amount} ${input.unit} added` };
      }
      case 'diff': {
        const a = parseInstant(input.from);
        const b = parseInstant(input.to);
        const ms = b.getTime() - a.getTime();
        const days = Math.round((ms / 86_400_000) * 1000) / 1000;
        return {
          data: { days, hours: Math.round((ms / 3_600_000) * 1000) / 1000, minutes: Math.round(ms / 60_000) },
          summary: `${days} days between the two dates`,
        };
      }
    }
  },
};
