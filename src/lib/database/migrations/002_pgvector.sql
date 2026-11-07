-- Semantic memory with pgvector. Applied only when the extension is available on the
-- server (for example the pgvector/pgvector Docker image or Supabase). When it is not
-- available this migration is a no-op and retrieval falls back to full-text search.
-- The vector dimension is fixed at migration time; set MEMORY_EMBEDDING_DIM to match
-- your NVIDIA_EMBEDDING_MODEL before running migrations for the first time.
DO $$
DECLARE
  dim integer := COALESCE(NULLIF(current_setting('mimo.embedding_dim', true), ''), '1024')::integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    EXECUTE format('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(%s)', dim);
    EXECUTE format('ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(%s)', dim);
    EXECUTE 'CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops)';
  ELSE
    RAISE NOTICE 'pgvector is not available; semantic retrieval disabled, full-text retrieval active.';
  END IF;
END $$;
