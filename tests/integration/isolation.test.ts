import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMemory, listMemories } from '@/lib/services/memories';
import { retrieveContext } from '@/lib/memory/retrieval';
import { createConversation, getConversation, listConversations } from '@/lib/services/conversations';
import { createDocumentRecord, getDocument, listDocuments } from '@/lib/services/documents';
import { ensureDb, makeUser, resetDb } from './helpers';

describe('per-user isolation', () => {
  beforeAll(ensureDb);
  beforeEach(resetDb);

  it('memories are private to their owner', async () => {
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');
    await createMemory(alice.id, { kind: 'fact', content: 'Alice confidential codename Falcon launches in March', source: 'user' });

    expect((await listMemories(alice.id)).length).toBe(1);
    expect(await listMemories(bob.id)).toHaveLength(0);
    expect(await listMemories(bob.id, 'Falcon')).toHaveLength(0);
  });

  it('context retrieval for one user never includes another user memories', async () => {
    const alice = await makeUser('ctx-alice@example.com');
    const bob = await makeUser('ctx-bob@example.com');
    await createMemory(alice.id, { kind: 'fact', content: 'Alice confidential codename Falcon launches in March', source: 'user' });

    const positive = await retrieveContext({ userId: alice.id, text: 'What is the Falcon codename launch?', includeMemory: true });
    expect(positive.block).toContain('Falcon');

    const negative = await retrieveContext({ userId: bob.id, text: 'What is the Falcon codename launch?', includeMemory: true });
    expect(negative.block).not.toContain('Falcon');
    expect(negative.refs.some((r) => r.title.includes('Falcon') || r.snippet.includes('Falcon'))).toBe(false);
  });

  it('conversations cannot be read or listed across users', async () => {
    const alice = await makeUser('conv-alice@example.com');
    const bob = await makeUser('conv-bob@example.com');
    const conv = await createConversation(alice.id, { mode: 'general' });
    expect(await getConversation(bob.id, conv.id)).toBeNull();
    expect(await listConversations(bob.id)).toHaveLength(0);
  });

  it('documents cannot be fetched by another user (IDOR)', async () => {
    const alice = await makeUser('doc-alice@example.com');
    const bob = await makeUser('doc-bob@example.com');
    const doc = await createDocumentRecord({
      userId: alice.id,
      name: 'payroll.csv',
      extension: 'csv',
      mimeType: 'text/csv',
      kind: 'data',
      sizeBytes: 10,
      sha256: 'a'.repeat(64),
      storageKey: 'x/payroll.csv',
    });
    expect(await getDocument(bob.id, doc.id)).toBeNull();
    expect(await listDocuments(bob.id)).toHaveLength(0);
    expect(await getDocument(alice.id, doc.id)).toBeTruthy();
  });
});
