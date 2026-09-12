export function buildRequestIssue(error, phase, t) {
  const saving = phase === "save";
  return {
    code: typeof error?.message === "string" && error.message
      ? error.message
      : saving
        ? "DRAFT_SAVE_REQUEST_FAILED"
        : "COMPILATION_REQUEST_FAILED",
    message: t(saving ? "builder.draftSaveRequestFailed" : "builder.compilationRequestFailed"),
    nodeId: null,
    path: null,
  };
}
