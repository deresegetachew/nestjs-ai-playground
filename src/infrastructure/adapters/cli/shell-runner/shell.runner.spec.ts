import { Test, TestingModule } from '@nestjs/testing';
import { Commander } from 'nest-commander/src/constants';
import { CommandBus } from '@nestjs/cqrs';
import { ShellRunner } from './shell.runner';
import { CONVERSATION_REPOSITORY } from '../../../../domain/ports/conversation-repository.port';
import { render } from 'ink';

describe('ShellRunner', () => {
  let runner: ShellRunner;
  let mockCommandBus: { execute: jest.Mock };
  let mockRepo: { findAllByAgent: jest.Mock; findById: jest.Mock };

  beforeEach(async () => {
    mockCommandBus = {
      execute: jest.fn(),
    };

    mockRepo = {
      findAllByAgent: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellRunner,
        {
          provide: Commander,
          useValue: {
            commands: [],
          },
        },
        {
          provide: CommandBus,
          useValue: mockCommandBus,
        },
        {
          provide: CONVERSATION_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    runner = module.get<ShellRunner>(ShellRunner);
  });

  it('should be defined', () => {
    expect(runner).toBeDefined();
  });

  it('should render Ink and wait until exit when run is called', async () => {
    await runner.run();
    expect(render).toHaveBeenCalled();
  });
});
