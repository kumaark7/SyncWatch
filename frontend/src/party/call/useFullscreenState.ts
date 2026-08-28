import { useEffect, useState } from "react";

export default function useFullscreenState() {
  const [fullscreenElement, setFullscreenElement] = useState<Element | null>(
    () => document.fullscreenElement
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreenElement(document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return fullscreenElement;
}
