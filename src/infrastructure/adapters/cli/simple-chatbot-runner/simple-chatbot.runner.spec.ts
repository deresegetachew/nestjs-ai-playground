jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
  };
  return {
    __esModule: true,
    default: jest.fn(() => mockSpinner),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { SimpleChatbotRunner } from './simple-chatbot.runner';
import { CommandBus } from '@nestjs/cqrs';
import { AskSimpleChatbotCommand } from '../../../../application/commands/ask-simple-chatbot.command';
import { of } from 'rxjs';

describe('SimpleChatbotRunner', () => {
  let runner: SimpleChatbotRunner;
  let mockCommandBus: { execute: jest.Mock };

  beforeEach(async () => {
    mockCommandBus = {
      execute: jest.fn().mockResolvedValue(of('chunk1', 'chunk2')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimpleChatbotRunner,
        {
          provide: CommandBus,
          useValue: mockCommandBus,
        },
      ],
    }).compile();

    runner = module.get<SimpleChatbotRunner>(SimpleChatbotRunner);
  });

  it('should be defined', () => {
    expect(runner).toBeDefined();
  });

  it('should dispatch AskSimpleChatbotCommand to CommandBus and subscribe to stream', async () => {
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation();
    await runner.run(['hello', 'world']);
    expect(mockCommandBus.execute).toHaveBeenCalledWith(
      expect.any(AskSimpleChatbotCommand),
    );
    const calls = mockCommandBus.execute.mock.calls as [
      AskSimpleChatbotCommand,
    ][];
    expect(calls[0][0].message).toBe('hello world');
    expect(stdoutSpy).toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});
