import { withTimeout } from './timeout.utils';

describe('withTimeout', () => {
  it('should resolve if the promise completes before the timeout', async () => {
    const p = Promise.resolve('success');
    await expect(withTimeout(p, 100, 'timed out')).resolves.toBe('success');
  });

  it('should reject with the custom error if the promise times out', async () => {
    const p = new Promise((resolve) => setTimeout(resolve, 200));
    await expect(withTimeout(p, 50, 'timed out')).rejects.toThrow('timed out');
  });
});
