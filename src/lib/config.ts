import { z } from 'zod';

/**
 * Server-only configuration. Values are read lazily so `next build` can run
 * without secrets. Never import this module from client components.
 */
const boolish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .optional()
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  DATABASE_SSL: boolish,

  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().default('meta/llama-3.1-70b-instruct'),
  /** Comma separated list of additional chat models offered in the UI selector. */
  NVIDIA_MODEL_OPTIONS: z.string().optional(),
  /** Vision-capable model used for image analysis. Unset = image analysis disabled. */
  NVIDIA_VISION_MODEL: z.string().optional(),
  /** Embedding model for semantic memory. Unset = lexical (full-text) retrieval only. */
  NVIDIA_EMBEDDING_MODEL: z.string().optional(),
  /** auto: try native tool calling and fall back to JSON protocol; native | json force a protocol. */
  NVIDIA_TOOL_CALLING: z.enum(['auto', 'native', 'json']).default('auto'),
  NVIDIA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  NVIDIA_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

  WEB_SEARCH_PROVIDER: z.enum(['none', 'brave', 'langsearch']).default('none'),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  LANGSEARCH_API_KEY: z.string().optional(),
  LANGSEARCH_BASE_URL: z.string().url().default('https://api.langsearch.com'),

  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  AUTH_COOKIE_SECURE: boolish,
  ADMIN_EMAILS: z.string().optional(),
  EMAIL_VERIFICATION_REQUIRED: boolish,
  /** In non-production only: include reset/verification links in API responses (for local testing). */
  DEV_EXPOSE_AUTH_LINKS: boolish,
  SMTP_URL: z.string().optional(),

  UPLOAD_DIR: z.string().default('./.data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(100).default(10),

  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(6),
  AGENT_MAX_TOOL_CALLS: z.coerce.number().int().min(0).max(30).default(8),
  AGENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8192).default(2048),
  AGENT_CONTEXT_TOKEN_BUDGET: z.coerce.number().int().min(1000).max(200000).default(12000),
  AGENT_DAILY_TOKEN_BUDGET: z.coerce.number().int().min(1000).default(2000000),
  AGENT_TOOL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),

  MEMORY_EMBEDDING_DIM: z.coerce.number().int().default(1024),
});

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Resets the cached configuration (used by tests). */
export function resetEnvCache(): void {
  cached = null;
}

export function requireDatabaseUrl(): string {
  const env = getEnv();
  const url = env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL ?? env.DATABASE_URL : env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured. See .env.example and README.md.');
  }
  return url;
}

export function getModelOptions(): string[] {
  const env = getEnv();
  const extra = (env.NVIDIA_MODEL_OPTIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([env.NVIDIA_MODEL, ...extra]));
}

export function getAdminEmails(): string[] {
  return (getEnv().ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
