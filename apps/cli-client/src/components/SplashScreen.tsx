import React from "react";
import { Box, Text, useInput } from "ink";
import { SPLASH_ART, SPLASH_SUBTITLE, SPLASH_BYLINE } from "@realms/client-common";

interface Props {
  onContinue: () => void;
}

export function SplashScreen({ onContinue }: Props) {
  useInput(() => {
    onContinue();
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" height={24}>
      <Box height={1} />

      {SPLASH_ART.map((line, i) => (
        <Text key={i} color="cyan" bold>
          {"  " + line}
        </Text>
      ))}

      <Box height={1} />

      <Text color="white">{SPLASH_SUBTITLE}</Text>
      <Text color="gray">{SPLASH_BYLINE}</Text>

      <Box height={3} />

      <Text color="yellow">Press any key to continue...</Text>
    </Box>
  );
}
