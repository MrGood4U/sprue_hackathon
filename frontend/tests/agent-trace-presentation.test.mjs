import assert from "node:assert/strict";
import test from "node:test";
import {traceSummary} from "../src/features/agent/tracePresentation.js";

const messages = {
  "agent.summary.graphDiscovery": "found={{candidates}} schemas={{schemas}} shown={{shown}}",
  "agent.summary.fieldRetrieval": "inspected={{inspected}} batches={{batches}} supplied={{supplied}} shown={{shown}}",
};

function t(key, values = {}) {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{{${name}}}`, String(value)),
    messages[key] ?? key,
  );
}

test("graph discovery summary distinguishes total and displayed candidates", () => {
  assert.equal(traceSummary({
    stage: "graph_source_discovery",
    status: "passed",
    summary: "legacy summary",
    details: {
      kind: "graph_discovery",
      candidateCount: 21,
      inspectedSchemas: 9,
      candidates: Array.from({length: 10}, () => ({})),
    },
  }, t), "found=21 schemas=9 shown=10");
});

test("field summary distinguishes supplied fields from displayed semantic candidates", () => {
  assert.equal(traceSummary({
    stage: "semantic_field_retrieval",
    status: "passed",
    summary: "legacy summary",
    details: {
      kind: "field_candidates",
      inspectedFieldCount: 412,
      embeddingBatchCount: 43,
      presentedFieldCount: 82,
      groups: [
        {requirements: [{alternatives: Array.from({length: 12}, () => ({}))}, {alternatives: Array.from({length: 12}, () => ({}))}]},
        {requirements: [{alternatives: Array.from({length: 12}, () => ({}))}, {alternatives: Array.from({length: 12}, () => ({}))}]},
      ],
    },
  }, t), "inspected=412 batches=43 supplied=82 shown=48");
});

test("active trace events retain their live provider progress text", () => {
  assert.equal(traceSummary({stage: "semantic_field_retrieval", status: "started", summary: "batch 4/12"}, t), "batch 4/12");
});
