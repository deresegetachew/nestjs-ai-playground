import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { Conversation } from '../../../domain/models/conversation.entity';
import { ConversationRepository } from '../../../domain/ports/conversation-repository.port';

@Injectable()
export class FileConversationRepository implements ConversationRepository {
  private readonly logger = new Logger(FileConversationRepository.name);
  private readonly storageDir: string;

  constructor() {
    this.storageDir = path.join(process.cwd(), 'data', 'conversations');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  async save(conversation: Conversation): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.storageDir, `${conversation.id}.json`);
    const data = {
      id: conversation.id,
      agentName: conversation.agentName,
      messages: conversation.messages,
      updatedAt: conversation.updatedAt.toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async findById(id: string): Promise<Conversation | null> {
    const filePath = path.join(this.storageDir, `${id}.json`);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const conversation = Conversation.create(data.id, data.agentName, data.messages);
      (conversation as any).updatedAt = new Date(data.updatedAt);
      return conversation;
    } catch (err: any) {
      this.logger.error(
        `Failed to read or parse conversation with ID "${id}": ${err.message || err}`,
        err.stack,
      );
      return null;
    }
  }

  async findAllByAgent(agentName: string): Promise<Conversation[]> {
    await this.ensureDir();
    try {
      const files = await fs.readdir(this.storageDir);
      const conversations: Conversation[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.storageDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (data.agentName === agentName) {
          const conversation = Conversation.create(data.id, data.agentName, data.messages);
          (conversation as any).updatedAt = new Date(data.updatedAt);
          conversations.push(conversation);
        }
      }
      return conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (err: any) {
      this.logger.error(
        `Failed to list conversations for agent "${agentName}": ${err.message || err}`,
        err.stack,
      );
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const filePath = path.join(this.storageDir, `${id}.json`);
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
    }
  }
}
