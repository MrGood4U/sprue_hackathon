import { useCallback, useEffect, useReducer } from "react";
import { createEditorState, editorReducer } from "./editorReducer.js";

export function useWorkflowEditor(sourceDraft) {
  const [state, dispatch] = useReducer(editorReducer, sourceDraft, createEditorState);

  useEffect(() => {
    dispatch({ type: "reset", draft: sourceDraft });
  }, [sourceDraft]);

  const setTool = useCallback((tool) => dispatch({ type: "set_tool", tool }), []);
  const selectNode = useCallback((id) => dispatch({ type: "select_node", id }), []);
  const selectEdge = useCallback((id) => dispatch({ type: "select_edge", id }), []);
  const onNodesChange = useCallback((changes) => dispatch({ type: "nodes_change", changes }), []);
  const onEdgesChange = useCallback((changes) => dispatch({ type: "edges_change", changes }), []);
  const onConnect = useCallback((connection) => dispatch({ type: "connect", connection }), []);
  const addOperator = useCallback((operatorType, position) => dispatch({ type: "add_operator", operatorType, position }), []);
  const addTemplate = useCallback((templateId, position) => dispatch({ type: "add_template", templateId, position }), []);
  const updateConfig = useCallback((id, config) => dispatch({ type: "update_config", id, config }), []);
  const configureSource = useCallback((id, config, source) => dispatch({type: "configure_source", id, config, source}), []);
  const deleteSelection = useCallback(() => dispatch({ type: "delete_selection" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const markClean = useCallback(() => dispatch({ type: "mark_clean" }), []);

  return {
    ...state,
    setTool,
    selectNode,
    selectEdge,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addOperator,
    addTemplate,
    updateConfig,
    configureSource,
    deleteSelection,
    undo,
    redo,
    markClean,
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
  };
}
