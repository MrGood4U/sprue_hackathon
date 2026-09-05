import { useCallback, useEffect, useReducer } from "react";
import { createEditorState, editorReducer } from "./editorReducer.js";

export function useWorkflowEditor(sourceDraft) {
  const [state, dispatch] = useReducer(editorReducer, sourceDraft, createEditorState);

  useEffect(() => {
    dispatch({ type: "reset", draft: sourceDraft });
  }, [sourceDraft]);

  const setTool = useCallback((tool) => dispatch({ type: "set_tool", tool }), []);
  const selectNode = useCallback((id) => dispatch({ type: "select_node", id }), []);
  const onNodesChange = useCallback((changes) => dispatch({ type: "nodes_change", changes }), []);
  const onEdgesChange = useCallback((changes) => dispatch({ type: "edges_change", changes }), []);
  const onConnect = useCallback((connection) => dispatch({ type: "connect", connection }), []);
  const addOperator = useCallback((operatorType, position) => dispatch({ type: "add_operator", operatorType, position }), []);
  const addTemplate = useCallback((templateId, position) => dispatch({ type: "add_template", templateId, position }), []);
  const updateConfig = useCallback((id, config) => dispatch({ type: "update_config", id, config }), []);
  const deleteSelection = useCallback(() => dispatch({ type: "delete_selection" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  return {
    ...state,
    setTool,
    selectNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addOperator,
    addTemplate,
    updateConfig,
    deleteSelection,
    undo,
    redo,
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
  };
}
