import {useI18n} from "../../i18n/I18nProvider.jsx";

function valueOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function similarity(value) {
  return typeof value === "number" ? value.toFixed(3) : null;
}

function Metric({label, value}) {
  return (
    <div className="agent-step-metric">
      <span>{label}</span>
      <strong>{valueOrDash(value)}</strong>
    </div>
  );
}

function Metrics({children}) {
  return <div className="agent-step-metrics">{children}</div>;
}

function Chips({items = [], emptyLabel}) {
  if (items.length === 0) return emptyLabel ? <span className="agent-step-empty">{emptyLabel}</span> : null;
  return <div className="agent-step-chips">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

function Section({title, children}) {
  return (
    <section className="agent-step-detail-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function EvidenceLabel({kind}) {
  const {t} = useI18n();
  return (
    <span className={`agent-step-evidence agent-step-evidence-${kind}`}>
      {t(kind === "embedding" ? "agent.details.embeddingRank" : "agent.details.deterministicRank")}
    </span>
  );
}

function candidateNetwork(candidate, t) {
  if (candidate.reportedNetwork) return candidate.reportedNetwork;
  if (candidate.networkEvidence === "display_name") return t("agent.details.networkFromName");
  if (candidate.networkEvidence === "conflict") return t("agent.details.networkConflict");
  return t("agent.details.networkUnverified");
}

function DiscoveryPlanDetails({details}) {
  const {t} = useI18n();
  const windowLabel = details.window
    ? t("agent.details.completeDays", {days: details.window.days})
    : t("agent.details.noWindow");
  return (
    <>
      <Metrics>
        <Metric label={t("agent.details.outputGrain")} value={details.result?.grain} />
        <Metric label={t("agent.details.outputFields")} value={details.result?.fields?.length ?? 0} />
        <Metric label={t("agent.details.window")} value={windowLabel} />
        <Metric label={t("agent.details.refresh")} value={details.refresh?.mode} />
      </Metrics>
      <Section title={t("agent.details.interpretedResult")}>
        <p>{details.intentSummary}</p>
        <p className="agent-step-secondary">{details.result?.description}</p>
        <Chips items={(details.result?.fields ?? []).map((field) => `${field.name} · ${field.type}${field.nullable ? "?" : ""}`)} />
      </Section>
      <Section title={t("agent.details.searchKeywords")}>
        <div className="agent-step-groups">
          {(details.searches ?? []).map((search) => (
            <div className="agent-step-compact-group" key={search.sourceNeedId}>
              <strong>{search.sourceNeedId}</strong>
              <Chips items={search.keywords ?? []} />
            </div>
          ))}
        </div>
      </Section>
      {(details.assumptions?.length ?? 0) > 0 && (
        <Section title={t("agent.details.assumptions")}>
          <ul className="agent-step-notes">{details.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        </Section>
      )}
    </>
  );
}

function SourceNeedsDetails({details}) {
  const {t} = useI18n();
  return (
    <div className="agent-step-groups">
      {(details.needs ?? []).map((need) => (
        <section className="agent-step-group" key={need.id}>
          <div className="agent-step-group-heading">
            <div><span>{t("agent.details.sourceNeed")}</span><strong>{need.id}</strong></div>
            <span className="agent-step-code">{need.dataNetwork}</span>
          </div>
          <Metrics>
            <Metric label={t("agent.details.grain")} value={need.grain} />
            <Metric label={t("agent.details.protocol")} value={need.protocol?.name} />
            <Metric label={t("agent.details.fields")} value={need.fields?.length ?? 0} />
            <Metric label={t("agent.details.aggregateAlternative")} value={need.preAggregated ? t("agent.details.requested") : t("agent.details.notRequired")} />
          </Metrics>
          <p>{need.description}</p>
          <Chips items={(need.assets ?? []).map((asset) => asset.networkAssetId ? `${asset.symbol} · ${asset.networkAssetId}` : asset.symbol)} />
          <div className="agent-step-field-list">
            {(need.fields ?? []).map((field) => (
              <div key={field.id}>
                <strong>{field.id}</strong>
                <span>{field.expectedType}{field.required ? ` · ${t("agent.details.required")}` : ""}</span>
                <p>{field.description}</p>
              </div>
            ))}
          </div>
          {(need.constraints?.length ?? 0) > 0 && <Chips items={need.constraints} />}
        </section>
      ))}
    </div>
  );
}

function GraphDiscoveryDetails({details}) {
  const {t} = useI18n();
  return (
    <>
      <Metrics>
        <Metric label={t("agent.details.sourceNeeds")} value={details.searchedNeeds} />
        <Metric label={t("agent.details.searchCalls")} value={details.searchCalls} />
        <Metric label={t("agent.details.schemasInspected")} value={details.inspectedSchemas} />
        <Metric label={t("agent.details.candidatesFound")} value={details.candidateCount} />
      </Metrics>
      <div className="agent-step-ranked-list">
        {(details.candidates ?? []).map((candidate) => (
          <article className="agent-step-ranked-row" key={`${candidate.sourceNeedId}:${candidate.candidateRef}`}>
            <div className="agent-step-ranked-main">
              <div>
                <span>{candidate.sourceNeedId}</span>
                <strong>{candidate.displayName}</strong>
              </div>
              <span className={`agent-step-evidence agent-step-evidence-${candidate.status}`}>{t(`agent.details.status.${candidate.status}`)}</span>
            </div>
            <div className="agent-step-ranked-facts">
              <span>{t("agent.details.discoveryScore")}: <strong>{candidate.score.toFixed(2)}</strong></span>
              <span>{t("agent.details.entities")}: <strong>{candidate.entityCount}</strong></span>
              <span>{t("agent.details.queries30d")}: <strong>{valueOrDash(candidate.totalQueryCount30d)}</strong></span>
              <span>{t("agent.details.network")}: <strong>{candidateNetwork(candidate, t)}</strong></span>
            </div>
            <code>{candidate.manifestIpfsCid}</code>
            {(candidate.limitations?.length ?? 0) > 0 && <Chips items={candidate.limitations} />}
          </article>
        ))}
      </div>
    </>
  );
}

function RankedEntityDetails({details, aggregate = false}) {
  const {t} = useI18n();
  const needCount = aggregate ? details.sourceNeedCount : details.fallbackNeedCount;
  const candidateCount = (details.groups ?? []).reduce((count, group) => count + (group.candidates?.length ?? 0), 0);
  return (
    <>
      <Metrics>
        <Metric label={t("agent.details.sourceNeeds")} value={needCount} />
        <Metric label={t("agent.details.rankedCandidates")} value={candidateCount} />
        {!aggregate && <Metric label={t("agent.details.embeddedEntities")} value={details.embeddedEntityCount} />}
        {!aggregate && <Metric label={t("agent.details.embeddingBatches")} value={details.embeddingBatchCount} />}
      </Metrics>
      {(details.groups ?? []).length === 0 || candidateCount === 0 ? (
        <p className="agent-step-empty">{t(aggregate ? "agent.details.noAggregateCandidates" : "agent.details.noFallbackCandidates")}</p>
      ) : (
        <div className="agent-step-groups">
          {details.groups.map((group) => (
            <Section title={`${t("agent.details.sourceNeed")} · ${group.sourceNeedId}`} key={group.sourceNeedId}>
              <div className="agent-step-ranked-list">
                {(group.candidates ?? []).map((candidate) => (
                  <article className="agent-step-ranked-row" key={`${candidate.candidateRef}:${candidate.queryEntity}`}>
                    <div className="agent-step-rank">#{candidate.rank}</div>
                    <div className="agent-step-ranked-content">
                      <div className="agent-step-ranked-main">
                        <div><span>{candidate.displayName}</span><strong>{candidate.queryEntity}</strong></div>
                        <div className="agent-step-ranked-score">
                          {similarity(candidate.semanticSimilarity) !== null && <strong>{similarity(candidate.semanticSimilarity)}</strong>}
                          <EvidenceLabel kind={candidate.rankingEvidence} />
                        </div>
                      </div>
                      <div className="agent-step-ranked-facts">
                        {candidate.semanticSimilarity !== null && <span>{t("agent.details.cosineSimilarity")}</span>}
                        <span>{t("agent.details.fields")}: <strong>{candidate.fieldCount}</strong></span>
                        <span>{t("agent.details.grain")}: <strong>{t(`agent.details.grain.${candidate.grainHint}`)}</strong></span>
                      </div>
                      <Chips items={candidate.matchedRequirements ?? []} emptyLabel={t("agent.details.noRequirementMatches")} />
                      {candidate.aggregation && (
                        <div className="agent-step-aggregation">
                          <span>{t("agent.details.sourceEntity")}: <strong>{candidate.aggregation.sourceEntity}</strong></span>
                          <span>{t("agent.details.intervals")}: <strong>{candidate.aggregation.intervals.join(", ")}</strong></span>
                          <span>{t("agent.details.dimensions")}: <strong>{candidate.aggregation.dimensions.join(", ") || "—"}</strong></span>
                          <span>{t("agent.details.measures")}: <strong>{candidate.aggregation.measures.map((measure) => `${measure.fieldPath}:${measure.fn}`).join(", ") || "—"}</strong></span>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}

function AggregateDecisionDetails({details}) {
  const {t} = useI18n();
  return (
    <>
      <Metrics>
        <Metric label={t("agent.details.sourceNeedsAssessed")} value={details.consideredCount} />
        <Metric label={t("agent.details.acceptedAggregates")} value={details.acceptedCount} />
        <Metric label={t("agent.details.rawFallbacks")} value={details.rawFallbackCount} />
      </Metrics>
      {(details.decisions?.length ?? 0) === 0 && <p className="agent-step-empty">{t("agent.details.noAggregateAssessment")}</p>}
      <div className="agent-step-decision-list">
        {(details.decisions ?? []).map((decision) => (
          <article className="agent-step-decision" key={decision.sourceNeedId}>
            <div className="agent-step-ranked-main">
              <div><span>{decision.sourceNeedId}</span><strong>{decision.decision === "use" ? `${decision.displayName} · ${decision.queryEntity}` : t("agent.details.rawFallback")}</strong></div>
              <span className={`agent-step-evidence agent-step-evidence-${decision.decision}`}>{t(`agent.details.decision.${decision.decision}`)}</span>
            </div>
            {decision.decision === "use" && (
              <>
                <div className="agent-step-ranked-facts"><span>{t("agent.details.interval")}: <strong>{decision.interval}</strong></span></div>
                <Chips items={(decision.fieldBindings ?? []).map((binding) => `${binding.requirementId} → ${binding.fieldPath}`)} />
              </>
            )}
            <p>{decision.rationale}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function EntitySelectionDetails({details}) {
  const {t} = useI18n();
  return (
    <>
      <Metrics>
        <Metric label={t("agent.details.aggregateSelections")} value={details.aggregateCount} />
        <Metric label={t("agent.details.rawSelections")} value={details.rawCount} />
      </Metrics>
      <div className="agent-step-decision-list">
        {(details.selections ?? []).map((selection) => (
          <article className="agent-step-decision" key={selection.sourceNeedId}>
            <div className="agent-step-ranked-main">
              <div><span>{selection.sourceNeedId}</span><strong>{selection.displayName} · {selection.queryEntity}</strong></div>
              <span className={`agent-step-evidence agent-step-evidence-${selection.selectionKind}`}>{t(`agent.details.selection.${selection.selectionKind}`)}</span>
            </div>
            <p>{selection.rationale}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function FieldCandidateDetails({details}) {
  const {t} = useI18n();
  const shownAlternativeCount = (details.groups ?? []).reduce(
    (count, group) => count + (group.requirements ?? []).reduce(
      (requirementCount, requirement) => requirementCount + (requirement.alternatives?.length ?? 0),
      0,
    ),
    0,
  );
  return (
    <>
      <Metrics>
        <Metric label={t("agent.details.fieldsInspected")} value={details.inspectedFieldCount} />
        <Metric label={t("agent.details.fieldsSupplied")} value={details.presentedFieldCount} />
        <Metric label={t("agent.details.semanticCandidatesShown")} value={shownAlternativeCount} />
        <Metric label={t("agent.details.embeddingBatches")} value={details.embeddingBatchCount} />
      </Metrics>
      <p className="agent-step-secondary">{t("agent.details.semanticCandidateNotice")}</p>
      <div className="agent-step-groups">
        {(details.groups ?? []).map((group) => (
          <section className="agent-step-group" key={`${group.sourceNeedId}:${group.candidateRef}:${group.queryEntity}`}>
            <div className="agent-step-group-heading">
              <div><span>{group.displayName}</span><strong>{group.queryEntity}</strong></div>
              <EvidenceLabel kind={group.rankingEvidence} />
            </div>
            <div className="agent-step-requirements">
              {(group.requirements ?? []).map((requirement) => (
                <section key={requirement.requirementId}>
                  <div className="agent-step-requirement-heading">
                    <div>
                      <strong>{requirement.requirementId}</strong>
                      <span>{requirement.expectedType}</span>
                      <span>{group.rankingEvidence === "embedding" ? t("agent.details.cosineSimilarity") : t("agent.details.deterministicRank")}</span>
                    </div>
                    <p>{requirement.description}</p>
                  </div>
                  {(requirement.alternatives?.length ?? 0) === 0 ? (
                    <p className="agent-step-empty">{t("agent.details.noCompatibleFields")}</p>
                  ) : (
                    <div className="agent-step-field-ranking">
                      {requirement.alternatives.map((field, index) => (
                        <div key={field.path}>
                          <span className="agent-step-rank">#{index + 1}</span>
                          <code>{field.path}</code>
                          <span>{field.graphType}</span>
                          {field.semanticSimilarity !== null && <strong>{field.semanticSimilarity.toFixed(3)}</strong>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function AgentStepDetails({details}) {
  if (!details?.kind) return null;
  if (details.kind === "discovery_plan") return <DiscoveryPlanDetails details={details} />;
  if (details.kind === "source_needs") return <SourceNeedsDetails details={details} />;
  if (details.kind === "graph_discovery") return <GraphDiscoveryDetails details={details} />;
  if (details.kind === "aggregate_candidates") return <RankedEntityDetails details={details} aggregate />;
  if (details.kind === "aggregate_decisions") return <AggregateDecisionDetails details={details} />;
  if (details.kind === "entity_candidates") return <RankedEntityDetails details={details} />;
  if (details.kind === "entity_selections") return <EntitySelectionDetails details={details} />;
  if (details.kind === "field_candidates") return <FieldCandidateDetails details={details} />;
  return null;
}
