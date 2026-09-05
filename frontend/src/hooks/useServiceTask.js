import { useCallback, useEffect, useRef, useState } from "react";

const initialState = { status: "idle", result: null, progress: 0 };

export function useServiceTask(task) {
  const activeRequest = useRef(null);
  const [state, setState] = useState(initialState);

  useEffect(() => () => activeRequest.current?.abort(), []);

  const run = useCallback(async () => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ ...initialState, status: "loading" });

    try {
      const result = await task({
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setState((current) => ({ ...current, progress }));
        },
      });
      if (!controller.signal.aborted) setState((current) => ({ ...current, status: "success", result }));
    } catch {
      if (!controller.signal.aborted) setState((current) => ({ ...current, status: "error" }));
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [task]);

  return { ...state, run };
}
