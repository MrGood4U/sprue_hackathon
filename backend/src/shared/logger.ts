export type LogEvent =
  | {
      event: "request";
      requestId: string;
      method: string;
      route: string;
      status: number;
      durationMs: number;
    }
  | {
      event:
        | "listening"
        | "stopping"
        | "stopped"
        | "startup_failed"
        | "pool_error"
        | "worker_standby";
      role: "api" | "worker";
    }
  | { event: "configuration_invalid"; fields: string[] }
  | { event: "request_failed"; requestId: string; code: string }
  | {
      event: "agent_planning_failed";
      code: string;
      reason:
        | "configuration"
        | "timeout"
        | "cancelled"
        | "connection"
        | "http_error"
        | "response_too_large"
        | "invalid_envelope"
        | "incomplete_response"
        | "missing_content"
        | "missing_tool_call"
        | "invalid_json"
        | "unexpected"
        | "non_model_error";
      status: number | null;
      providerCode: string | null;
      providerParam: string | null;
      durationMs: number;
    }
  | {
      event: "agent_debug";
      stage: "source_discovery_planning" | "graph_source_discovery" | "source_feasibility";
      networks?: readonly string[];
      searches?: readonly {sourceNeedId: string; keywords: readonly string[]}[];
      searchCalls?: number;
      candidateCount?: number;
      inspectedSchemas?: number;
      candidates?: readonly {
        candidateRef: string;
        sourceNeedId: string;
        discoveryMethod: "keyword" | "contract";
        logicalSubgraphId: string | null;
        manifestIpfsCid: string;
        displayName: string;
        reportedNetwork: string | null;
        networkEvidence: "contract_filter" | "display_name" | "unknown" | "conflict";
        totalQueryCount30d: number | null;
        queryActivityEvidence: "observed" | "missing";
        schemaHash: string | null;
        schemaBytes: number | null;
        entities: readonly {
          queryEntity: string;
          entityType: string;
          fields: readonly {
            path: string;
            graphType: string;
            valueType: "boolean" | "string" | "id" | "address" | "bytes" | "integer" | "decimal" | "timestamp" | "date" | "json";
            nullable: boolean;
            list: boolean;
          }[];
          suggestedBindings: readonly {requirementId: string; fieldPaths: readonly string[]}[];
          matchedRequirements: readonly string[];
        }[];
        status: "suitable" | "needs_verification" | "incompatible";
        score: number;
        limitations: readonly string[];
      }[];
      outcome?: "feasibility" | "clarification" | "unsupported" | "repair";
      code?: string;
      selectionCount?: number;
      contradictionCount?: number;
    }
  | {
      event: "provider_retry_scheduled";
      provider: "privy" | "hedera";
      operation:
        | "wallet_list"
        | "wallet_create"
        | "wallet_balance"
        | "mirror_account";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      reason: "timeout" | "connection" | "rate_limit" | "server_error";
      status: number | null;
    }
  | {
      event: "provider_request_recovered";
      provider: "privy" | "hedera";
      operation:
        | "wallet_list"
        | "wallet_create"
        | "wallet_balance"
        | "mirror_account";
      attempts: number;
    }
  | {
      event: "provider_request_failed";
      provider: "privy" | "hedera";
      operation:
        | "wallet_list"
        | "wallet_create"
        | "wallet_balance"
        | "mirror_account"
        | "faucet_disbursement";
      attempts: number;
      reason:
        | "timeout"
        | "connection"
        | "rate_limit"
        | "server_error"
        | "client_error"
        | "invalid_response"
        | "unexpected";
      status: number | null;
      retryable: boolean;
      retryExhausted: boolean;
    }
  | {
      event: "hedera_account_reconciliation";
      attempts: number;
      outcome: "already_exists" | "created" | "resolved_after_uncertainty" | "unresolved";
    }
  | {
      event: "wallet_bootstrap_failed";
      provider: "privy";
      stage: "provider" | "storage" | "unexpected";
    };
export interface Logger {
  write(event: LogEvent): void;
}
export const stdoutLogger: Logger = {
  write(event) {
    process.stdout.write(
      JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n",
    );
  },
};
