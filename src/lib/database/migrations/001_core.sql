-- MIMO AGENT core schema. Every user-owned row carries user_id for isolation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  password_hash     text NOT NULL,
  role              text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  email_verified_at timestamptz,
  last_login_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE profiles (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  locale       text NOT NULL DEFAULT 'en',
  preferences  jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE auth_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);

CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description  text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 8000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_idx ON projects (user_id, updated_at DESC);

CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  title       text NOT NULL DEFAULT 'New chat' CHECK (char_length(title) <= 200),
  mode        text NOT NULL DEFAULT 'general',
  model       text,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_idx ON conversations (user_id, updated_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content         text NOT NULL CHECK (char_length(content) <= 200000),
  attachments     jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_id          uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, created_at);
CREATE INDEX messages_user_idx ON messages (user_id);

CREATE TABLE message_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment    text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

-- Admin overrides for agent modes (defaults live in code).
CREATE TABLE agents (
  key                   text PRIMARY KEY,
  enabled               boolean NOT NULL DEFAULT true,
  allowed_tools         text[],
  system_prompt_override text CHECK (char_length(system_prompt_override) <= 8000),
  temperature           numeric(3,2) CHECK (temperature IS NULL OR (temperature >= 0 AND temperature <= 2)),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Admin overrides for tools (defaults live in code).
CREATE TABLE tools (
  name              text PRIMARY KEY,
  enabled           boolean NOT NULL DEFAULT true,
  requires_approval boolean,
  timeout_ms        integer CHECK (timeout_ms IS NULL OR timeout_ms BETWEEN 1000 AND 120000),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,
  mode              text NOT NULL,
  model             text NOT NULL,
  protocol          text NOT NULL DEFAULT 'native' CHECK (protocol IN ('native', 'json')),
  status            text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'awaiting_approval', 'step_limit')),
  steps_used        integer NOT NULL DEFAULT 0,
  tool_calls        integer NOT NULL DEFAULT 0,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  error_code        text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);
CREATE INDEX agent_runs_user_idx ON agent_runs (user_id, started_at DESC);

CREATE TABLE agent_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idx         integer NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('plan', 'model', 'tool', 'approval', 'final', 'error', 'memory')),
  name        text,
  input       jsonb,
  output      jsonb,
  status      text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error', 'denied', 'pending', 'running')),
  duration_ms integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_steps_run_idx ON agent_steps (run_id, idx);

CREATE TABLE tool_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id          uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  tool_name       text NOT NULL,
  input           jsonb NOT NULL,
  summary         text NOT NULL,
  consequences    text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'failed', 'completed')),
  result          jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  decided_at      timestamptz
);
CREATE INDEX tool_approvals_user_idx ON tool_approvals (user_id, status);

CREATE TABLE documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  original_name text NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 255),
  extension     text NOT NULL CHECK (extension IN ('pdf', 'txt', 'csv', 'docx', 'png', 'jpg', 'jpeg')),
  mime_type     text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('document', 'data', 'image')),
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  sha256        text NOT NULL,
  storage_key   text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'ready', 'error')),
  error_message text,
  text_chars    integer NOT NULL DEFAULT 0,
  summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_user_idx ON documents (user_id, created_at DESC);

CREATE TABLE document_chunks (
  id             bigserial PRIMARY KEY,
  document_id    uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_index    integer NOT NULL,
  content        text NOT NULL,
  token_estimate integer NOT NULL DEFAULT 0,
  tsv            tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX document_chunks_tsv_idx ON document_chunks USING GIN (tsv);
CREATE INDEX document_chunks_user_idx ON document_chunks (user_id);

CREATE TABLE memories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('preference', 'fact', 'project')),
  content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  source     text NOT NULL CHECK (source IN ('user', 'agent_approved')),
  tsv        tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memories_tsv_idx ON memories USING GIN (tsv);
CREATE INDEX memories_user_idx ON memories (user_id, created_at DESC);

CREATE TABLE notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content    text NOT NULL DEFAULT '' CHECK (char_length(content) <= 50000),
  tags       text[] NOT NULL DEFAULT '{}',
  tsv        tsvector GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_tsv_idx ON notes USING GIN (tsv);
CREATE INDEX notes_user_idx ON notes (user_id, updated_at DESC);

CREATE TABLE tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  status      text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  progress    integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  due_at      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_user_idx ON tasks (user_id, status);

CREATE TABLE usage_records (
  id                bigserial PRIMARY KEY,
  user_id           uuid REFERENCES users(id) ON DELETE CASCADE,
  run_id            uuid REFERENCES agent_runs(id) ON DELETE SET NULL,
  model             text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('chat', 'vision', 'embedding', 'search', 'other')),
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  latency_ms        integer,
  ok                boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_user_idx ON usage_records (user_id, created_at DESC);
CREATE INDEX usage_created_idx ON usage_records (created_at DESC);

CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  category   text NOT NULL CHECK (category IN ('auth', 'data', 'admin', 'security', 'agent', 'error', 'system')),
  action     text NOT NULL,
  target     text,
  ip         text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_user_idx ON audit_logs (user_id, created_at DESC);

CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
