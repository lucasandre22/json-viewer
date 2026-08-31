# Future Feature Ideas

These are independent additions for later decisions. They are not part of the graph-performance work.

| Feature | User value | Architecture fit |
| --- | --- | --- |
| File import, export, and sample documents | Open local JSON quickly and save graph edits as JSON. | Reuses the editor's canonical raw JSON state. |
| Validation diagnostics | Explain invalid JSON and locate the failing character or line. | Builds on parser positions and the textarea selection flow. |
| Search, filter, and JSON-path navigation | Find keys/values and focus the matching node in large documents. | Uses the extracted tree model and graph viewport controls. |
| Expand/collapse controls by depth | Show only the hierarchy level needed for exploration. | Extends the progressive-disclosure state introduced for performance. |
| Alternate tree/list view | Provides an accessible, compact view when a graph is not the best representation. | Shares the same parsed tree and selection state. |
| Undo/redo | Safely recover JSON and graph edits. | Requires a history layer around canonical text/tree updates. |
| Persisted workspaces | Restore JSON input, collapsed branches, and manual node positions. | Can persist the graph UI state separately from the JSON document. |
| JSON Schema validation | Validate documents against a supplied schema and annotate affected nodes. | Adds a validation pass over the model without changing layout. |
| JSON diff/compare mode | Compare two JSON documents and highlight additions, removals, and changes. | Reuses the tree model but requires a second document and comparison layer. |
