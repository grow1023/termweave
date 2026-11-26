// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/tools/lines/NativeChatToolFileTarget.tsx; adapted for TermWeave.
// Change: the file opens through TermWeave's OpenFileContext instead of Orca's link router.
import { useContext } from "react";

import { OpenFileContext } from "../../../lib/filePaths.ts";
import { cn } from "../../cn.ts";

/** Expose the full path accessibly; opening the file never toggles the row around it. */
export function ToolFileTarget({ path, label, className, openable = true }: {
  path: string;
  label: string;
  className: string;
  /** False when there is nothing left to open, such as a deleted file. */
  openable?: boolean;
}) {
  const openFile = useContext(OpenFileContext);
  if (!openable || !openFile) {
    return (
      <>
        <span className={className} title={path} aria-hidden="true">{label}</span>
        <span className="sr-only">{path}</span>
      </>
    );
  }
  return (
    <span
      role="link"
      tabIndex={0}
      className={cn(className, "cursor-pointer rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      title={path}
      aria-label={path}
      onClick={(event) => {
        // The row around this is its expand button; opening the file must not also toggle it.
        event.stopPropagation();
        openFile(path);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          openFile(path);
        }
      }}
    >
      {label}
    </span>
  );
}
