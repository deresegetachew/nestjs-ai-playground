import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import { FileConversationRepository } from './file-conversation.repository';
import { Conversation } from '../../../domain/models/conversation.entity';
import { AgentMessage } from '../../../application/ports/agent-types';

jest.mock('node:fs/promises', () => {
  const original = jest.requireActual('node:fs/promises');
  return {
    __esModule: true,
    ...original,
    readFile: jest.fn().mockImplementation((...args: any[]) => original.readFile(...args)),
  };
});

describe('FileConversationRepository', () => {
  let repository: FileConversationRepository;
  const testConvId = 'test-conversation-id';
  const testAgentName = 'test-agent';

  beforeEach(() => {
    repository = new FileConversationRepository();
  });

  afterEach(async () => {
    await repository.delete(testConvId);
  });

  it('should save and find a conversation by ID', async () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    const conversation = Conversation.create(testConvId, testAgentName, messages);

    await repository.save(conversation);

    const retrieved = await repository.findById(testConvId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(testConvId);
    expect(retrieved!.agentName).toBe(testAgentName);
    expect(retrieved!.messages).toEqual(messages);
    expect(retrieved!.updatedAt).toBeInstanceOf(Date);
  });

  it('should return null when finding a non-existent conversation', async () => {
    const retrieved = await repository.findById('non-existent');
    expect(retrieved).toBeNull();
  });

  it('should find all conversations by agent name', async () => {
    const conv1 = Conversation.create('test-c1', testAgentName);
    const conv2 = Conversation.create('test-c2', 'other-agent');
    const conv3 = Conversation.create('test-c3', testAgentName);

    await repository.save(conv1);
    await repository.save(conv2);
    await repository.save(conv3);

    try {
      const list = await repository.findAllByAgent(testAgentName);
      expect(list.length).toBe(2);
      expect(list.map((c) => c.id)).toContain('test-c1');
      expect(list.map((c) => c.id)).toContain('test-c3');
      expect(list.map((c) => c.id)).not.toContain('test-c2');
    } finally {
      await repository.delete('test-c1');
      await repository.delete('test-c2');
      await repository.delete('test-c3');
    }
  });

  it('should delete a conversation', async () => {
    const conversation = Conversation.create(testConvId, testAgentName);
    await repository.save(conversation);

    const existsBefore = await repository.findById(testConvId);
    expect(existsBefore).not.toBeNull();

    await repository.delete(testConvId);

    const existsAfter = await repository.findById(testConvId);
    expect(existsAfter).toBeNull();
  });

  it('should log an error and return null when findById encounters fs read failure', async () => {
    const filePath = path.join(repository['storageDir'], 'some-id.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // Write actual file to pass existsSync check
    await fs.writeFile(filePath, 'dummy content', 'utf-8');

    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    (fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('Permission denied'));

    try {
      const retrieved = await repository.findById('some-id');
      expect(retrieved).toBeNull();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read or parse conversation with ID "some-id"'),
        expect.any(String),
      );
    } finally {
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
      loggerSpy.mockRestore();
    }
  });
});
