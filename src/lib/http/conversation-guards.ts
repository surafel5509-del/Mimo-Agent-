import { ApiError } from './errors';

export function parseUuid(value: string, label = 'id'): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, 'bad_request', `Invalid ${label}.`);
  }
  return value;
}
