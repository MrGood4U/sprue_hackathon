import assert from "node:assert/strict";
import test from "node:test";
import { GRAPH_ACCESS_MODE, showsGraphCredentials } from "../src/features/wallet/graphAccessMode.js";

test("Graph credentials are disclosed only for API-key access", () => {
  assert.equal(showsGraphCredentials(GRAPH_ACCESS_MODE.API_KEY), true);
  assert.equal(showsGraphCredentials(GRAPH_ACCESS_MODE.X402), false);
  assert.equal(showsGraphCredentials("unknown"), false);
});
