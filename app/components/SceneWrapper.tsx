"use client";

import { useChat } from "ai/react";
import Scene from "./Scene";
import OverlayCube from "./OverlayCube";

export default function SceneWrapper() {
  const chatProps = useChat();

  return (
    <>
      <Scene chatProps={chatProps} />
      <OverlayCube chatProps={chatProps} />
    </>
  );
}
