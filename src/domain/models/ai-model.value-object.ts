import { ValueObject } from './value-object';
import { AIVendor } from './ai-vendor.value-object';

interface AIModelProps {
  id: string; // Vendor-specific ID (e.g., 'gemini-1.5-flash')
  name: string; // Human-readable name
  vendor: AIVendor;
  maxTokens?: number;
  supportedVoices?: Array<{ id: string; name: string; description?: string }>;
}

export class AIModel extends ValueObject<AIModelProps> {
  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get vendor(): AIVendor {
    return this.props.vendor;
  }

  get supportedVoices():
    | Array<{ id: string; name: string; description?: string }>
    | undefined {
    return this.props.supportedVoices
      ? [...this.props.supportedVoices]
      : undefined;
  }

  private constructor(props: AIModelProps) {
    super(props);
  }

  public static create(props: AIModelProps): AIModel {
    return new AIModel(props);
  }
}
