import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Tool } from '../../../../application/ports/tool.interface';
import { AgentKey } from '../../../../application/ports/agent-config.interface';

const SpecialistInputSchema = z.object({
  specialists: z
    .array(z.nativeEnum(AgentKey))
    .min(1)
    .max(3)
    .describe('One or more specialists needed to fully resolve this customer message. Select multiple if the message spans domains.'),
  reason: z
    .string()
    .min(1)
    .describe('One sentence explaining the routing decision.'),
});

type SpecialistInput = z.infer<typeof SpecialistInputSchema>;
type SpecialistOutput = SpecialistInput;

@Injectable()
export class SupportDeskSpecialistTool implements Tool<SpecialistInput, SpecialistOutput> {
  readonly name = 'select_specialist';
  readonly description = 'Select one or more specialists for this customer message. Always call this tool — never answer directly.';
  readonly version = '1';
  readonly schema = SpecialistInputSchema;

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    return input;
  }
}
