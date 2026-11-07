import { query, queryOne } from '@/lib/database/pool';
import { getEnv, getModelOptions } from '@/lib/config';
import { AGENT_MODE_IDS, type AgentModeId } from '@/lib/agents/modes';

export const DEFAULT_TIMEZONE = 'Africa/Addis_Ababa';

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type UserPreferences = {
  theme: 'dark' | 'light' | 'system';
  timezone: string;
  defaultModel: string;
  defaultMode: AgentModeId;
  memoryEnabled: boolean;
  useHistory: boolean;
};

export type Profile = { displayName: string; locale: 'en'; preferences: UserPreferences };

export function defaultPreferences(): UserPreferences {
  const models = getModelOptions();
  return {
    theme: 'dark',
    timezone: DEFAULT_TIMEZONE,
    defaultModel: models[0] ?? getEnv().NVIDIA_MODEL,
    defaultMode: 'general',
    memoryEnabled: true,
    useHistory: true,
  };
}

/** Merges stored preferences over defaults and drops anything invalid. */
export function resolvePreferences(raw: unknown): UserPreferences {
  const base = defaultPreferences();
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const theme = ['dark', 'light', 'system'].includes(String(p.theme)) ? (p.theme as UserPreferences['theme']) : base.theme;
  const defaultMode = AGENT_MODE_IDS.includes(p.defaultMode as AgentModeId) ? (p.defaultMode as AgentModeId) : base.defaultMode;
  const defaultModel =
    typeof p.defaultModel === 'string' && getModelOptions().includes(p.defaultModel) ? p.defaultModel : base.defaultModel;
  const timezone = typeof p.timezone === 'string' && isValidTimezone(p.timezone) ? p.timezone : base.timezone;
  return {
    theme,
    timezone,
    defaultModel,
    defaultMode,
    memoryEnabled: typeof p.memoryEnabled === 'boolean' ? p.memoryEnabled : base.memoryEnabled,
    useHistory: typeof p.useHistory === 'boolean' ? p.useHistory : base.useHistory,
  };
}

export async function getProfile(userId: string): Promise<Profile> {
  const row = await queryOne<{ display_name: string; locale: string; preferences: unknown }>(
    `SELECT display_name, locale, preferences FROM profiles WHERE user_id = $1`,
    [userId],
  );
  return {
    displayName: row?.display_name ?? '',
    locale: 'en',
    preferences: resolvePreferences(row?.preferences),
  };
}

export async function updateProfile(
  userId: string,
  patch: { displayName?: string; locale?: 'en'; preferences?: Partial<UserPreferences> },
): Promise<Profile> {
  const current = await getProfile(userId);
  const next = {
    displayName: patch.displayName ?? current.displayName,
    preferences: resolvePreferences({ ...current.preferences, ...(patch.preferences ?? {}) }),
  };
  await query(
    `INSERT INTO profiles (user_id, display_name, locale, preferences, updated_at)
     VALUES ($1, $2, 'en', $3, now())
     ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, preferences = EXCLUDED.preferences, updated_at = now()`,
    [userId, next.displayName, next.preferences],
  );
  return { displayName: next.displayName, locale: 'en', preferences: next.preferences };
}
