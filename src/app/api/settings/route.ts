import { webSearchConfigured } from '@/lib/tools/web-search';
import { apiRoute, clientIp, jsonOk, readJson } from '@/lib/http/respond';
import { requireUser } from '@/lib/auth/guards';
import { settingsPatchSchema } from '@/lib/validation/schemas';
import { getProfile, updateProfile, defaultPreferences } from '@/lib/services/profile';
import { writeAudit } from '@/lib/services/audit';
import { getModelOptions } from '@/lib/config';
import { ApiError } from '@/lib/http/errors';
import { AGENT_MODE_IDS } from '@/lib/agents/modes';
import { isValidTimezone } from '@/lib/services/profile';
import { getEnv } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  const user = await requireUser(req);
  const profile = await getProfile(user.id);
  return jsonOk({
    profile,
    email: user.email,
    role: user.role,
    options: { models: getModelOptions(), modes: AGENT_MODE_IDS, defaults: defaultPreferences() },
    capabilities: { webSearch: webSearchConfigured(), vision: Boolean(getEnv().NVIDIA_VISION_MODEL), semanticMemory: Boolean(getEnv().NVIDIA_EMBEDDING_MODEL) },
  });
});

export const PATCH = apiRoute(async (req) => {
  const user = await requireUser(req);
  const patch = settingsPatchSchema.parse(await readJson(req));
  if (patch.preferences?.defaultModel && !getModelOptions().includes(patch.preferences.defaultModel)) {
    throw new ApiError(400, 'model_not_allowed', 'That model is not enabled on this server.');
  }
  if (patch.preferences?.timezone && !isValidTimezone(patch.preferences.timezone)) {
    throw new ApiError(400, 'invalid_timezone', 'Choose a valid timezone.');
  }
  const profile = await updateProfile(user.id, patch);
  await writeAudit({ userId: user.id, category: 'data', action: 'settings.update', ip: clientIp(req), metadata: { fields: Object.keys(patch) } });
  return jsonOk({ profile });
});
