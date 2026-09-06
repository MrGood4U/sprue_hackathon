import { useCallback, useEffect, useState } from "react";
import { frontendServices } from "../../services/index.js";

export function useModelProfile() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    frontendServices.getModelProfile({signal: controller.signal})
      .then((next) => {
        if (!controller.signal.aborted) {
          setProfile(next);
          setStatus("ready");
        }
      })
      .catch((nextError) => {
        if (!controller.signal.aborted) {
          setError(nextError);
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, []);

  const save = useCallback(async (values) => {
    setStatus("saving");
    setError(null);
    try {
      const next = await frontendServices.saveModelProfile(values);
      setProfile(next);
      setStatus("saved");
      return next;
    } catch (nextError) {
      setError(nextError);
      setStatus("error");
      throw nextError;
    }
  }, []);

  return {profile, status, error, save};
}
