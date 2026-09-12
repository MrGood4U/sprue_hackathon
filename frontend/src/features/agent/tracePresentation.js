export const stageTitleKeys = {
  admit: "agent.stage.admit",
  source_discovery_planning: "agent.stage.discoveryPlan",
  source_needs: "agent.stage.sourceNeeds",
  graph_source_discovery: "agent.stage.graphDiscovery",
  aggregate_schema_retrieval: "agent.stage.aggregateRetrieval",
  aggregate_selection: "agent.stage.aggregateSelection",
  semantic_entity_retrieval: "agent.stage.semanticRetrieval",
  source_entity_selection: "agent.stage.entitySelection",
  semantic_field_retrieval: "agent.stage.semanticFieldRetrieval",
  source_feasibility: "agent.stage.feasibility",
  feasibility_validation: "agent.stage.validation",
  semantic_interpretation: "agent.stage.model",
  source_selection: "agent.stage.sources",
  query_compilation: "agent.stage.sources",
  dag_composition: "agent.stage.dag",
  spec_assembly: "agent.stage.dag",
  spec_validation: "agent.stage.validation",
  dag_execution: "agent.stage.dag",
  output: "agent.stage.output",
};

function groupedItemCount(groups, key) {
  return (groups ?? []).reduce((count, group) => count + (group?.[key]?.length ?? 0), 0);
}

export function stageTitle(stage, t) {
  const key = stageTitleKeys[stage];
  return key ? t(key) : stage.replaceAll("_", " ");
}

export function traceSummary(event, t) {
  if (!event || event.status !== "passed") return event?.summary ?? "";
  const details = event.details;

  if (event.stage === "admit") return t("agent.summary.admit");
  if (event.stage === "source_discovery_planning") return t("agent.summary.discoveryPlan");
  if (event.stage === "source_needs" && details?.kind === "source_needs") {
    return t("agent.summary.sourceNeeds", {count: details.needs?.length ?? 0});
  }
  if (event.stage === "graph_source_discovery" && details?.kind === "graph_discovery") {
    return t("agent.summary.graphDiscovery", {
      candidates: details.candidateCount,
      schemas: details.inspectedSchemas,
      shown: details.candidates?.length ?? 0,
    });
  }
  if (event.stage === "aggregate_schema_retrieval" && details?.kind === "aggregate_candidates") {
    return t("agent.summary.aggregateRetrieval", {
      needs: details.sourceNeedCount,
      candidates: groupedItemCount(details.groups, "candidates"),
    });
  }
  if (event.stage === "aggregate_selection" && details?.kind === "aggregate_decisions") {
    return t("agent.summary.aggregateSelection", {
      needs: details.consideredCount,
      accepted: details.acceptedCount,
      fallback: details.rawFallbackCount,
    });
  }
  if (event.stage === "semantic_entity_retrieval" && details?.kind === "entity_candidates") {
    return t("agent.summary.entityRetrieval", {
      embedded: details.embeddedEntityCount,
      batches: details.embeddingBatchCount,
      shown: groupedItemCount(details.groups, "candidates"),
    });
  }
  if (event.stage === "source_entity_selection" && details?.kind === "entity_selections") {
    return t("agent.summary.entitySelection", {
      aggregates: details.aggregateCount,
      raw: details.rawCount,
    });
  }
  if (event.stage === "semantic_field_retrieval" && details?.kind === "field_candidates") {
    const shown = (details.groups ?? []).reduce(
      (count, group) => count + (group.requirements ?? []).reduce(
        (requirementCount, requirement) => requirementCount + (requirement.alternatives?.length ?? 0),
        0,
      ),
      0,
    );
    return t("agent.summary.fieldRetrieval", {
      inspected: details.inspectedFieldCount,
      batches: details.embeddingBatchCount,
      supplied: details.presentedFieldCount,
      shown,
    });
  }
  if (event.stage === "source_feasibility") return t("agent.summary.feasibility");
  if (event.stage === "feasibility_validation") return t("agent.summary.validation");
  return event.summary;
}
