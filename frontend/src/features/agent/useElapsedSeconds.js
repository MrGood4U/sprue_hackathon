import {useEffect, useState} from "react";

export function useElapsedSeconds(active) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    const update = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    update();
    const intervalId = globalThis.setInterval(update, 1000);
    return () => globalThis.clearInterval(intervalId);
  }, [active]);

  return elapsedSeconds;
}
