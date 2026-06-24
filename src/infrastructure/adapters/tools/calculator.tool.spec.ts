import { CalculatorTool } from './calculator.tool';

describe('CalculatorTool', () => {
  let tool: CalculatorTool;

  beforeEach(() => {
    tool = new CalculatorTool();
  });

  it('should be defined with correct name and description', () => {
    expect(tool).toBeDefined();
    expect(tool.name).toBe('calculator');
    expect(tool.description).toBe(
      'Evaluate mathematical expressions. ' + 'Returns a number.',
    );
  });

  it('should evaluate simple mathematical expressions', async () => {
    const result = await tool.execute({ expression: '2 + 2' });
    expect(result).toBe(4);

    const multResult = await tool.execute({ expression: '10 * 5' });
    expect(multResult).toBe(50);
  });

  it('should throw an error if the expression does not result in a number', async () => {
    await expect(tool.execute({ expression: '"hello"' })).rejects.toThrow(
      'Expression did not evaluate to a number.',
    );
  });

  it('should evaluate expressions using Math functions like log10 and sqrt', async () => {
    const logResult = await tool.execute({ expression: 'log10(100)' });
    expect(logResult).toBe(2);

    const sqrtResult = await tool.execute({ expression: 'sqrt(16)' });
    expect(sqrtResult).toBe(4);

    const piResult = await tool.execute({ expression: 'PI' });
    expect(piResult).toBeCloseTo(Math.PI);
  });

  it('should reject sandbox-breaking or non-mathematical expressions safely', async () => {
    await expect(
      tool.execute({ expression: 'process.exit(1)' }),
    ).rejects.toThrow();

    await expect(
      tool.execute({ expression: 'console.log("hello")' }),
    ).rejects.toThrow();
  });
});
