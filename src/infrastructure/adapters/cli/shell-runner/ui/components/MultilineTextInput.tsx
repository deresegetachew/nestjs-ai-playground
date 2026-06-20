import React, { useState, useEffect } from 'react';
import type * as InkModule from 'ink';

interface Coords {
  line: number;
  col: number;
  lines: string[];
}

export function getCoords(text: string, index: number): Coords {
  const lines = text.split('\n');
  let accum = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length;
    if (index >= accum && index <= accum + lineLen) {
      return { line: i, col: index - accum, lines };
    }
    accum += lineLen + 1; // +1 for the '\n' character
  }
  return { line: lines.length - 1, col: lines[lines.length - 1].length, lines };
}

export function getIndex(lines: string[], line: number, col: number): number {
  let index = 0;
  for (let i = 0; i < line; i++) {
    index += (lines[i] ? lines[i].length : 0) + 1;
  }
  index += col;
  return index;
}

export interface MultilineTextInputProps {
  ink: typeof InkModule;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  borderColor?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const MultilineTextInput: React.FC<MultilineTextInputProps> = ({
  ink,
  value,
  onChange,
  onSubmit,
  borderColor = 'cyan',
  placeholder = '',
  disabled = false,
}) => {
  const { Box, Text, useInput } = ink;
  const [cursorIndex, setCursorIndex] = useState(0);

  // Sync cursor index if the value is cleared or changed externally
  useEffect(() => {
    if (cursorIndex > value.length) {
      setCursorIndex(value.length);
    }
  }, [value]);

  useInput((input, key) => {
    // 1. Exit/Interrupt handling (do not block Ctrl+C)
    if (key.ctrl && input === 'c') {
      return;
    }

    if (disabled) {
      return;
    }

    // 2. Submit or Newline
    if (key.return) {
      if (key.meta || key.shift) {
        const left = value.slice(0, cursorIndex);
        const right = value.slice(cursorIndex);
        const newValue = left + '\n' + right;
        onChange(newValue);
        setCursorIndex(cursorIndex + 1);
      } else {
        onSubmit(value);
        setCursorIndex(0);
      }
      return;
    }

    // 3. Backspace
    if (key.backspace) {
      if (cursorIndex > 0) {
        const left = value.slice(0, cursorIndex - 1);
        const right = value.slice(cursorIndex);
        const newValue = left + right;
        onChange(newValue);
        setCursorIndex(cursorIndex - 1);
      }
      return;
    }

    // 4. Delete
    if (key.delete) {
      if (cursorIndex < value.length) {
        const left = value.slice(0, cursorIndex);
        const right = value.slice(cursorIndex + 1);
        const newValue = left + right;
        onChange(newValue);
      }
      return;
    }

    // 5. Navigation
    if (key.leftArrow) {
      setCursorIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorIndex((prev) => Math.min(value.length, prev + 1));
      return;
    }
    if (key.upArrow) {
      const { line, col, lines } = getCoords(value, cursorIndex);
      if (line > 0) {
        const prevLine = line - 1;
        const prevLineLen = lines[prevLine].length;
        const newCol = Math.min(col, prevLineLen);
        const newIndex = getIndex(lines, prevLine, newCol);
        setCursorIndex(newIndex);
      }
      return;
    }
    if (key.downArrow) {
      const { line, col, lines } = getCoords(value, cursorIndex);
      if (line < lines.length - 1) {
        const nextLine = line + 1;
        const nextLineLen = lines[nextLine].length;
        const newCol = Math.min(col, nextLineLen);
        const newIndex = getIndex(lines, nextLine, newCol);
        setCursorIndex(newIndex);
      }
      return;
    }

    // Ctrl Shortcuts (Ctrl+A for home, Ctrl+E for end)
    if (key.ctrl) {
      if (input === 'a') {
        const { line, lines } = getCoords(value, cursorIndex);
        const newIndex = getIndex(lines, line, 0);
        setCursorIndex(newIndex);
      } else if (input === 'e') {
        const { line, lines } = getCoords(value, cursorIndex);
        const newIndex = getIndex(lines, line, lines[line].length);
        setCursorIndex(newIndex);
      }
      return;
    }

    // 6. Character Typing (excluding meta, ctrl, escape sequences)
    if (
      input &&
      !key.ctrl &&
      !key.meta &&
      input !== '\r' &&
      input !== '\n' &&
      input !== '\t' &&
      input !== '\u001b'
    ) {
      const left = value.slice(0, cursorIndex);
      const right = value.slice(cursorIndex);
      const newValue = left + input + right;
      onChange(newValue);
      setCursorIndex(cursorIndex + input.length);
    }
  });

  const renderLines = () => {
    if (disabled) {
      if (value.length === 0) {
        return (
          <Box flexDirection="row">
            {placeholder && <Text color="gray">{placeholder}</Text>}
          </Box>
        );
      }
      const lines = value.split('\n');
      return lines.map((lineText, idx) => (
        <Box key={idx} flexDirection="row">
          <Text color="gray">{lineText || ' '}</Text>
        </Box>
      ));
    }

    if (value.length === 0) {
      return (
        <Box flexDirection="row">
          <Text inverse> </Text>
          {placeholder && <Text color="gray"> {placeholder}</Text>}
        </Box>
      );
    }

    const { line: curLine, col: curCol, lines } = getCoords(value, cursorIndex);
    return lines.map((lineText, idx) => {
      if (idx === curLine) {
        const left = lineText.slice(0, curCol);
        const cursorChar = lineText[curCol] || ' ';
        const right = lineText.slice(curCol + 1);
        return (
          <Box key={idx} flexDirection="row">
            <Text>{left}</Text>
            <Text inverse>{cursorChar}</Text>
            <Text>{right}</Text>
          </Box>
        );
      } else {
        return (
          <Box key={idx} flexDirection="row">
            <Text>{lineText || ' '}</Text>
          </Box>
        );
      }
    });
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={disabled ? 'gray' : borderColor}
      paddingX={1}
      paddingY={0}
      width="100%"
    >
      {renderLines()}
    </Box>
  );
};
