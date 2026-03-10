import React from "react";
import { Box, Text } from "ink";

interface Props {
  infoPanelOpen?: boolean;
}

function Hint({ label, keys }: { label: string; keys: string }) {
  return (
    <Text>
      <Text color="yellow" bold>{keys}</Text>
      <Text color="gray"> {label}</Text>
    </Text>
  );
}

function Sep() {
  return <Text color="gray" dimColor> | </Text>;
}

export function HintBar({ infoPanelOpen }: Props) {
  return (
    <Box paddingX={1} justifyContent="center" gap={0}>
      <Hint keys="Tab" label={infoPanelOpen ? "Close Panel" : "Info Panel"} />
      <Sep />
      <Hint keys="PgUp/Dn" label="Scroll" />
      <Sep />
      <Hint keys="Up/Dn" label="Command quiHistory" />
      <Sep />
      <Hint keys="map" label="" />
      <Sep />
      <Hint keys="look" label="" />
      <Sep />
      <Hint keys="help" label="" />
      <Sep />
      <Hint keys="quit" label="" />
    </Box>
  );
}
