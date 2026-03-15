import React from "react";
import { Box, Text, useInput } from "ink";

interface Props {
  onContinue: () => void;
}

export function SplashScreen({ onContinue }: Props) {
  useInput(() => {
    onContinue();
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" height={24}>
      <Box height={2} />

      <Text color="cyan" bold>
        {"  ╔═══════════════════════════════════╗"}
      </Text>
      <Text color="cyan" bold>
        {"  ║                                   ║"}
      </Text>
      <Text color="cyan" bold>
        {"  ║       F E D E R A T E D           ║"}
      </Text>
      <Text color="cyan" bold>
        {"  ║           R E A L M S             ║"}
      </Text>
      <Text color="cyan" bold>
        {"  ║                                   ║"}
      </Text>
      <Text color="cyan" bold>
        {"  ╚═══════════════════════════════════╝"}
      </Text>

      <Box height={1} />

      <Text color="white">Federated MUD on the AT Protocol</Text>

      <Box height={1} />

      <Text color="gray" dimColor>
        CLI by OtherwiseJunk
      </Text>

      <Box height={3} />

      <Text color="yellow">Press any key to continue...</Text>
    </Box>
  );
}
