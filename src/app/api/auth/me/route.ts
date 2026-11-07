import { getRequestUser } from '@/lib/auth/guards';
import { jsonOk, apiRoute } from '@/lib/http/respond';
import { Errors } from '@/lib/http/errors';
import { toPublicUser } from '@/lib/services/users';
import { getProfile } from '@/lib/services/profile';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (req) => {
  const user = await getRequestUser(req);
  if (!user) throw Errors.unauthorized();
  const profile = await getProfile(user.id);
  return jsonOk({ user: toPublicUser(user), profile });
});
