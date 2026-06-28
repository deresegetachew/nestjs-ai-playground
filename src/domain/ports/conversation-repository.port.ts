import { Conversation } from '../models/conversation.entity';

export interface ConversationRepository {
  save(conversation: Conversation): Promise<void>;
  findById(id: string): Promise<Conversation | null>;
  findAllByAgent(agentName: string): Promise<Conversation[]>;
  delete(id: string): Promise<void>;
}

export const CONVERSATION_REPOSITORY = 'CONVERSATION_REPOSITORY';
