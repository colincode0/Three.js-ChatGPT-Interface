"use client";

import { useChat } from "ai/react";
import Scene from "./Scene";
import OverlayCube from "./OverlayCube";
import { useState } from "react";

export default function SceneWrapper() {
  const [shouldFadeOut, setShouldFadeOut] = useState(false);
  const chatProps = useChat();

  // Handle chat events using the returned methods
  const handleSubmit = chatProps.handleSubmit;
  const wrappedHandleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    setShouldFadeOut(true);
    await handleSubmit(e);
  };

  chatProps.handleSubmit = wrappedHandleSubmit;

  return (
    <>
      <Scene chatProps={chatProps} />
      <OverlayCube chatProps={chatProps} shouldFadeOut={shouldFadeOut} />
    </>
  );
}
