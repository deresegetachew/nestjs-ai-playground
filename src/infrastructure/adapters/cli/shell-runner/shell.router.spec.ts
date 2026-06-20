import { ShellRouter } from './shell.router';

describe('ShellRouter', () => {
  let router: ShellRouter;

  beforeEach(() => {
    router = new ShellRouter();
  });

  describe('Session Mode', () => {
    it('should resolve :exit to EXIT action', () => {
      expect(router.resolve(':exit', true)).toEqual({ type: 'EXIT' });
      expect(router.resolve('  :EXIT  ', true)).toEqual({ type: 'EXIT' });
    });

    it('should resolve clear to CLEAR action', () => {
      expect(router.resolve('clear', true)).toEqual({ type: 'CLEAR' });
    });

    it('should resolve empty string to EMPTY action', () => {
      expect(router.resolve('   ', true)).toEqual({ type: 'EMPTY' });
    });

    it('should resolve normal text to CHAT action', () => {
      expect(router.resolve('what is the weather?', true)).toEqual({
        type: 'CHAT',
        payload: 'what is the weather?',
      });
    });
  });

  describe('Parent Shell Mode', () => {
    it('should resolve exit and quit to EXIT action', () => {
      expect(router.resolve('exit', false)).toEqual({ type: 'EXIT' });
      expect(router.resolve('quit', false)).toEqual({ type: 'EXIT' });
    });

    it('should resolve clear to CLEAR action', () => {
      expect(router.resolve('clear', false)).toEqual({ type: 'CLEAR' });
    });

    it('should resolve agent command with no name to AGENT_MENU action', () => {
      expect(router.resolve('agent', false)).toEqual({ type: 'AGENT_MENU' });
      expect(router.resolve('  AGENT  ', false)).toEqual({
        type: 'AGENT_MENU',
      });
    });

    it('should resolve agent command with name to AGENT_SELECT action', () => {
      expect(router.resolve('agent simple-chatbot', false)).toEqual({
        type: 'AGENT_SELECT',
        payload: 'simple-chatbot',
      });
      expect(router.resolve('agent:simple-chatbot', false)).toEqual({
        type: 'AGENT_SELECT',
        payload: 'simple-chatbot',
      });
    });

    it('should resolve direct command syntax to EXECUTE_AGENT_COMMAND action', () => {
      expect(
        router.resolve('simple-chatbot "hello world" --flag', false),
      ).toEqual({
        type: 'EXECUTE_AGENT_COMMAND',
        payload: 'simple-chatbot',
        args: ['hello world', '--flag'],
      });
    });

    it('should resolve empty or whitespace strings to EMPTY action', () => {
      expect(router.resolve('', false)).toEqual({ type: 'EMPTY' });
      expect(router.resolve('   ', false)).toEqual({ type: 'EMPTY' });
    });
  });
});
