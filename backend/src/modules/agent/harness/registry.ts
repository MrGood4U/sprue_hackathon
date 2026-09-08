import {z} from "zod";
import type {CompositionNode, OperatorSignature} from "./types.js";

export const operatorRegistry: readonly OperatorSignature[] = [
  {
    type: "source",
    operatorVersion: "1",
    inputPorts: [],
    outputPorts: ["rows"],
    configContract: "Compiler-owned inspected source and static query plan references.",
  },
  {
    type: "filter",
    operatorVersion: "1",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{predicate:'timestamp_in_run_window'}; omit when the source query enforces the same window.",
  },
  {
    type: "map",
    operatorVersion: "1",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "Either {sourceNeedId} for canonical swap normalization or {recipe:'cross_chain_wallet_summary_v1'}.",
  },
  {
    type: "aggregate",
    operatorVersion: "1",
    inputPorts: ["rows"],
    outputPorts: ["rows"],
    configContract: "{groupBy:['wallet'],measures:['tradeCount','volumeUsd','firstSeenAt','lastSeenAt']}.",
  },
  {
    type: "union",
    operatorVersion: "1",
    inputPorts: ["left", "right"],
    outputPorts: ["rows"],
    configContract: "{mode:'append_compatible_rows'}.",
  },
  {
    type: "join",
    operatorVersion: "1",
    inputPorts: ["left", "right"],
    outputPorts: ["rows"],
    configContract: "{type:'inner',keys:[{left:'wallet',right:'wallet'}],cardinality:'one_to_one'}.",
  },
  {
    type: "output",
    operatorVersion: "1",
    inputPorts: ["rows"],
    outputPorts: [],
    configContract: "{orderBy:[{field:'wallet',direction:'asc'}]}.",
  },
] as const;

const filterConfig = z.object({predicate: z.literal("timestamp_in_run_window")}).strict();
const normalizeConfig = z.object({sourceNeedId: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/)}).strict();
const computeConfig = z.object({recipe: z.literal("cross_chain_wallet_summary_v1")}).strict();
const aggregateConfig = z.object({
  groupBy: z.tuple([z.literal("wallet")]),
  measures: z.tuple([
    z.literal("tradeCount"),
    z.literal("volumeUsd"),
    z.literal("firstSeenAt"),
    z.literal("lastSeenAt"),
  ]),
}).strict();
const unionConfig = z.object({mode: z.literal("append_compatible_rows")}).strict();
const joinConfig = z.object({
  type: z.literal("inner"),
  keys: z.tuple([z.object({left: z.literal("wallet"), right: z.literal("wallet")}).strict()]),
  cardinality: z.literal("one_to_one"),
}).strict();
const outputConfig = z.object({
  orderBy: z.tuple([z.object({field: z.literal("wallet"), direction: z.literal("asc")}).strict()]),
}).strict();

export class OperatorConfigError extends Error {
  readonly code = "OPERATOR_CONFIG_INVALID";

  constructor(role: string, message: string) {
    super(`Operator ${role} has invalid configuration: ${message}`);
    this.name = "OperatorConfigError";
  }
}

export function validateCompositionNode(node: CompositionNode): void {
  const schema = node.operator === "filter"
    ? filterConfig
    : node.operator === "map"
      ? z.union([normalizeConfig, computeConfig])
      : node.operator === "aggregate"
        ? aggregateConfig
        : node.operator === "union"
          ? unionConfig
          : node.operator === "join"
            ? joinConfig
            : outputConfig;
  const result = schema.safeParse(node.config);
  if (!result.success) {
    throw new OperatorConfigError(node.role, result.error.issues[0]?.message ?? "invalid config");
  }
}

export function registryEntry(type: OperatorSignature["type"]): OperatorSignature {
  const entry = operatorRegistry.find((candidate) => candidate.type === type);
  if (!entry) throw new OperatorConfigError(type, "operator is not registered");
  return entry;
}
