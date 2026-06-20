import React from 'react';
import * as ink from 'ink';
import { getCoords, getIndex, MultilineTextInput } from './MultilineTextInput';
import { reactMockControl } from '../react-mock-setup';

describe('MultilineTextInput Coordinates Helpers', () => {
  describe('getCoords', () => {
    it('should handle single line text coordinates', () => {
      const text = 'hello';
      expect(getCoords(text, 0)).toEqual({
        line: 0,
        col: 0,
        lines: ['hello'],
      });
      expect(getCoords(text, 5)).toEqual({
        line: 0,
        col: 5,
        lines: ['hello'],
      });
    });

    it('should handle multiline text coordinates', () => {
      const text = 'hello\nworld';
      expect(getCoords(text, 6)).toEqual({
        line: 1,
        col: 0,
        lines: ['hello', 'world'],
      });
    });
  });

  describe('getIndex', () => {
    it('should compute flat index from 2D coordinates', () => {
      const lines = ['hello', 'world'];
      expect(getIndex(lines, 1, 0)).toBe(6);
    });
  });
});

describe('MultilineTextInput Component', () => {
  let registeredHandler: ((input: string, key: any) => void) | null = null;
  const mockInk = ink;

  beforeEach(() => {
    registeredHandler = null;
    reactMockControl.reset();
    (ink.useInput as jest.Mock).mockImplementation((handler) => {
      registeredHandler = handler;
    });
  });

  it('should render empty value with placeholder', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    reactMockControl.reset();
    const element = MultilineTextInput({
      ink: mockInk,
      value: '',
      onChange,
      onSubmit,
      placeholder: 'Type here...',
    });
    expect(element).toBeDefined();
  });

  it('should handle typing normal characters', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    reactMockControl.setCursorIndex(3);
    MultilineTextInput({
      ink: mockInk,
      value: 'abc',
      onChange,
      onSubmit,
    });

    expect(registeredHandler).toBeDefined();
    registeredHandler!('d', {});
    expect(onChange).toHaveBeenCalledWith('abcd');
  });

  it('should handle navigation keys', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    reactMockControl.setCursorIndex(5);
    MultilineTextInput({
      ink: mockInk,
      value: 'hello\nworld',
      onChange,
      onSubmit,
    });

    // Move left
    registeredHandler!('', { leftArrow: true });
    // Move right
    registeredHandler!('', { rightArrow: true });
    // Move up
    registeredHandler!('', { upArrow: true });
    // Move down
    registeredHandler!('', { downArrow: true });
  });

  it('should handle ctrl+a and ctrl+e shortcuts', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    reactMockControl.setCursorIndex(5);
    MultilineTextInput({
      ink: mockInk,
      value: 'hello\nworld',
      onChange,
      onSubmit,
    });

    // Ctrl+A
    registeredHandler!('a', { ctrl: true });
    // Ctrl+E
    registeredHandler!('e', { ctrl: true });
  });

  it('should handle backspace and delete', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    reactMockControl.setCursorIndex(2);
    MultilineTextInput({
      ink: mockInk,
      value: 'abc',
      onChange,
      onSubmit,
    });

    // Backspace
    registeredHandler!('', { backspace: true });
    // Delete
    registeredHandler!('', { delete: true });
  });

  it('should handle return key to submit or add newline', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    reactMockControl.setCursorIndex(3);
    MultilineTextInput({
      ink: mockInk,
      value: 'abc',
      onChange,
      onSubmit,
    });

    // Alt+Enter (newline)
    registeredHandler!('', { return: true, meta: true });
    expect(onChange).toHaveBeenCalledWith('abc\n');

    // Normal Enter (submit)
    registeredHandler!('', { return: true });
    expect(onSubmit).toHaveBeenCalledWith('abc');
  });

  it('should ignore input when disabled', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    reactMockControl.setCursorIndex(3);
    MultilineTextInput({
      ink: mockInk,
      value: 'abc',
      onChange,
      onSubmit,
      disabled: true,
    });

    registeredHandler!('d', {});
    expect(onChange).not.toHaveBeenCalled();
  });
});
