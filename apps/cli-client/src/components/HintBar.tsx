import React from "react";
import { Box, Text } from "ink";
import type { QuestEntry } from "../hooks/use-game-state.js";

interface Props {
  infoPanelOpen?: boolean;
  quests?: QuestEntry[];
}

function Hint({ label, keys }: { label: string; keys: string }) {
  return (
    <Text>
      <Text color="yellow" bold>
        {keys}
      </Text>
      <Text color="gray"> {label}</Text>
    </Text>
  );
}

function Sep() {
  return (
    <Text color="gray" dimColor>
      {" "}
      |{" "}
    </Text>
  );
}

export function HintBar({ infoPanelOpen, quests }: Props) {
  const activeQuest = quests?.[0];
  const currentObj = activeQuest?.objectives.find((o) => !o.done);
  const questHint =
    activeQuest && currentObj
      ? `${activeQuest.questName}: ${currentObj.description}${currentObj.required > 1 ? ` (${currentObj.current}/${currentObj.required})` : ""}`
      : null;

  return (
    <Box paddingX={1} justifyContent="center" gap={0}>
      <Hint keys="Tab" label={infoPanelOpen ? "Close Panel" : "Info Panel"} />
      <Sep />
      <Hint keys="PgUp/Dn" label="Scroll" />
      <Sep />
      <Hint keys="Up/Dn" label="Command History" />
      <Sep />
      <Hint keys="map" label="" />
      <Sep />
      <Hint keys="look" label="" />
      <Sep />
      <Hint keys="help" label="" />
      <Sep />
      <Hint keys="quit" label="" />
      {questHint && (
        <>
          <Sep />
          <Text color="yellow">{"\u2691"} </Text>
          <Text color="gray">{questHint}</Text>
        </>
      )}
    </Box>
  );
}
