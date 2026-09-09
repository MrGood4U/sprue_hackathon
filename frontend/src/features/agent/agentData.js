import {listAgentMessages} from "../../services/api/agent.js";
import {getProduct, listProducts} from "../../services/api/products.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveProduct(productRef, options) {
  if (uuidPattern.test(productRef ?? "")) return getProduct(productRef, options);
  const {products} = await listProducts({...options, limit: 100});
  const summary = products.find((item) => item.slug === productRef);
  if (!summary) throw new Error("PRODUCT_NOT_FOUND");
  return getProduct(summary.id, options);
}

export async function loadAgentMessages(sessionId, options) {
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
