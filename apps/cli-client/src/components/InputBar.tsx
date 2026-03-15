import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  onSubmit: (input: string) => void;
}

export function InputBar({ onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useInput((input, key) => {
    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setHistory((prev) => [...prev.slice(-50), trimmed]);
        setHistoryIndex(-1);
      }
      setValue("");
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (key.upArrow) {
      if (history.length === 0) return;
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setValue(history[newIndex]);
      return;
    }

    if (key.downArrow) {
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setHistoryIndex(-1);
        setValue("");
      } else {
        setHistoryIndex(newIndex);
        setValue(history[newIndex]);
      }
      return;
    }

    if (key.escape) {
      setValue("");
      setHistoryIndex(-1);
      return;
    }

    // Regular character input
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
    }
  });

  return (
    <Box borderStyle="single" borderColor="green" paddingX={1}>
      <Text color="green" bold>
        {"> "}
      </Text>
      <Text>{value}</Text>
      <Text color="gray">█</Text>
    </Box>
  );
}
