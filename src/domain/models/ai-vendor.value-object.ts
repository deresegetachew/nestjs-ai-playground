export enum AIVendor {
  GEMINI = 'Gemini',
  OPENAI = 'OpenAI',
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace AIVendor {
  export function fromString(name: string): AIVendor {
    switch (name.toLowerCase()) {
      case 'gemini':
        return AIVendor.GEMINI;
      case 'openai':
        return AIVendor.OPENAI;
      default:
        return name as AIVendor;
    }
  }
}
