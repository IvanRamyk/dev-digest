/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract, plus
   the FileCard primitive (reused by SmartDiffViewer, which drives its own
   open-state, per-line marks and header slot). */
export { DiffViewer } from "./DiffViewer";
export { FileCard, type FileCardProps } from "./FileCard";
export type { DiffCommentApi } from "./comments";
