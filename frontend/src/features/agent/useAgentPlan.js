import {useCallback, useEffect, useRef, useState} from "react";
import {useAuth} from "../auth/AuthProvider.jsx";
import {
  createAgentSession,
  listAgentMessages,
  listAgentSessions,
  listAgentTraceEvents,
  submitAgentMessage,
} from "../../services/api/agent.js";
import {getProduct, listProducts, updateProduct} from "../../services/api/products.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveProduct(productRef, options) {
  if (uuidPattern.test(productRef ?? "")) return getProduct(productRef, options);
  const {products} = await listProducts({...options, limit: 100});
  const summary = products.find((item) => item.slug === productRef);
  if (!summary) throw new Error("PRODUCT_NOT_FOUND");
  return getProduct(summary.id, options);
}

async function loadMessages(sessionId, options) {
  const messages = [];
  let afterSequence = 0;
  for (let page = 0; page < 10; page += 1) {
    const result = await listAgentMessages(sessionId, {...options, afterSequence, limit: 100});
    messages.push(...result.messages);
    if (!result.hasMore) return messages;
    const next = Number(result.nextAfterSequence);
    if (!Number.isSafeInteger(next) || next <= afterSequence) throw new Error("INVALID_AGENT_API_RESPONSE");
    afterSequence = next;
  }
  throw new Error("AGENT_MESSAGE_LIMIT_EXCEEDED");
}

function pollingDelay(signal, milliseconds = 400) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    let timeoutId;
    const finish = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timeoutId = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, {once: true});
  });
}

async function pollActiveTrace(sessionId, options, signal, onTrace) {
  let traceStreamId = null;
  let afterSequence = 0;
  let events = [];
  while (!signal.aborted) {
    try {
      const result = await listAgentTraceEvents(sessionId, {...options, afterSequence, limit: 100, signal});
      if (signal.aborted) return;
      if (result.traceStreamId && result.traceStreamId !== traceStreamId) {
        traceStreamId = result.traceStreamId;
        afterSequence = 0;
        events = [];
      }
      if (result.events.length > 0) {
        const known = new Set(events.map((event) => event.sequenceNo));
        events = [...events, ...result.events.filter((event) => !known.has(event.sequenceNo))]
          .sort((left, right) => left.sequenceNo - right.sequenceNo);
        onTrace(events);
      }
      const next = Number(result.nextAfterSequence);
      if (Number.isSafeInteger(next) && next >= afterSequence) afterSequence = next;
      if (result.hasMore) continue;
    } catch (error) {
      if (signal.aborted || error?.name === "AbortError") return;
      // The terminal message remains authoritative if one polling read is lost.
    }
    await pollingDelay(signal);
  }
}

export function useAgentPlan(productRef) {
  const {identity, getAccessToken} = useAuth();
  const workspaceId = identity?.defaultWorkspaceId;
  const activeLoad = useRef(null);
  const activePlanning = useRef(null);
  const requestKey = useRef(null);
  const planning = useRef(false);
  const [state, setState] = useState({
    status: "loading",
    product: null,
    session: null,
    messages: [],
    liveTrace: [],
    command: null,
    error: null,
  });

  const scope = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!workspaceId || !accessToken) throw new Error("AUTH_REQUIRED");
    return {workspaceId, accessToken};
  }, [getAccessToken, workspaceId]);

  const load = useCallback(async (signal) => {
    setState((current) => ({...current, status: "loading", error: null}));
    try {
      const options = {...await scope(), signal};
      const product = await resolveProduct(productRef, options);
      const sessions = await listAgentSessions({...options, productId: product.id});
      const session = sessions.find((item) => item.status === "active") ?? sessions[0] ?? null;
      const messages = session ? await loadMessages(session.id, options) : [];
      setState({status: "ready", product, session, messages, liveTrace: [], command: null, error: null});
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState((current) => ({...current, status: "error", error}));
    }
  }, [productRef, scope]);

  useEffect(() => {
    const controller = new AbortController();
    activeLoad.current = controller;
    void load(controller.signal);
    return () => {
      controller.abort();
      activePlanning.current?.abort();
    };
  }, [load]);

  const refresh = useCallback(() => {
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    return load(controller.signal);
  }, [load]);

  const generate = useCallback(async (contentText, responseLocale) => {
    const normalized = contentText.trim();
    if (!normalized || normalized.length > 8000 || planning.current || !state.product) return;
    planning.current = true;
    setState((current) => ({...current, status: "planning", liveTrace: [], error: null}));
    const idempotencyKey = requestKey.current?.intent === normalized
      ? requestKey.current.key
      : `sprue-agent-message-${globalThis.crypto.randomUUID()}`;
    requestKey.current = {intent: normalized, key: idempotencyKey};
    try {
      const options = await scope();
      const session = state.session ?? await createAgentSession({
        productId: state.product.id,
        title: state.product.name,
      }, options);
      const pollingController = new AbortController();
      activePlanning.current = pollingController;
      const polling = pollActiveTrace(
        session.id,
        options,
        pollingController.signal,
        (liveTrace) => setState((current) => ({...current, session, liveTrace})),
      );
      let command;
      try {
        command = await submitAgentMessage(session.id, {
          contentText: normalized,
          responseLocale,
        }, {...options, idempotencyKey});
      } finally {
        pollingController.abort();
        await polling;
        if (activePlanning.current === pollingController) activePlanning.current = null;
      }
      const [messages, product] = await Promise.all([
        loadMessages(session.id, options),
        getProduct(state.product.id, options),
      ]);
      requestKey.current = null;
      setState((current) => ({...current, status: "ready", product, session, messages, liveTrace: [], command, error: null}));
      return command;
    } catch (error) {
      if (error?.name === "AbortError") return;
      setState((current) => ({...current, status: "error", error}));
      throw error;
    } finally {
      planning.current = false;
    }
  }, [scope, state.product, state.session]);

  const rename = useCallback(async (name) => {
    if (!state.product) return;
    const product = await updateProduct(state.product.id, {name}, {
      ...await scope(),
      lockVersion: state.product.lockVersion,
    });
    setState((current) => ({...current, product}));
  }, [scope, state.product]);

  const latestAssistant = [...state.messages].reverse().find((message) => message.role === "assistant") ?? null;
  const trace = latestAssistant?.contentJson?.trace ?? [];
  const planState = state.status === "planning"
    ? "planning"
    : latestAssistant?.contentJson?.kind === "error" || state.status === "error"
      ? "failed"
      : latestAssistant
        ? "ready"
        : "idle";

  return {...state, latestAssistant, trace, planState, refresh, generate, rename};
}
