function compilationField(field) {
  return {
    name: field.name,
    type: field.type,
    nullable: field.nullable,
    unit: field.unit,
  };
}

export function createBuilderCompilationInput(draft) {
  const specification = draft?.specification;
  return {
    schemaVersion: 1,
    dag: {
      nodes: (specification?.dag?.nodes ?? []).map((node) => ({
        id: node.id,
        type: node.type,
        operatorVersion: node.operatorVersion,
        config: structuredClone(node.config ?? {}),
        ...(node.outputSchema ? {
          outputSchema: {fields: (node.outputSchema.fields ?? []).map(compilationField)},
        } : {}),
      })),
      edges: (specification?.dag?.edges ?? []).map((edge) => ({
        fromNode: edge.fromNode,
        fromPort: edge.fromPort,
        toNode: edge.toNode,
        toPort: edge.toPort,
      })),
    },
    outputSchema: {
      fields: (specification?.outputSchema?.fields ?? []).map(compilationField),
    },
  };
}
