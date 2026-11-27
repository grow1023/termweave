import type { ReactNode } from "react";
// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/composer/NativeChatComposer.tsx; adapted for TermWeave.
import { Composer, type ComposerFrameParts, type ComposerProps } from "../../../components/Composer.tsx";
import { useT } from "../../../lib/i18n.ts";
import { AttachmentChip } from "./AttachmentChip.tsx";
import { CommandMenu } from "./CommandMenu.tsx";
import { ComposerActions, ModelChip, type ComposerPrimary } from "./ComposerActions.tsx";
import { ComposerFrame } from "./ComposerFrame.tsx";
import { ContextRing } from "./ContextRing.tsx";
import "./orca-composer.css";

/**
 * The chat's composer: TermWeave's `Composer` (IME guard, drafts, voice, attachments, slash and @
 * menus, queue mode, height memory) drawn in Orca's frame through `renderFrame`. Must sit inside
 * `ChatRoot` (the `.orca` tokens and the root's `100cqi`).
 *
 * Decision: the frame's own element carries TermWeave's `.composer` class, once, so the bottom
 * safe-area inset, the `[data-keyboard]` rule and `.terminal-host:has(.composer)` still apply.
 */
/** Draws the model control in place of the read-only chip; it gets what the chat reports it runs on. */
export type ModelControl = (running: { model: string | null; effort: string | null }) => ReactNode;

export interface OrcaComposerProps extends Omit<ComposerProps, "renderFrame"> {
  modelControl?: ModelControl;
  /**
   * false: no attach button and no file input (a chat with no upload route, such as a session bot's).
   * A pasted or dropped file still goes to `onUploadImage`, which refuses it with its own message.
   */
  attach?: boolean;
}

export function OrcaComposer({ attach = true, modelControl, ...props }: OrcaComposerProps) {
  return (
    <div className="orca-composer contents" data-orca-composer="">
      <Composer {...props} renderFrame={(parts) => <OrcaComposerFrame parts={parts} attach={attach} modelControl={modelControl} />} />
    </div>
  );
}

interface Controls {
  primary: ComposerPrimary | null;
  stop: { disabled: boolean; onStop: () => void } | null;
  queue: { disabled: boolean; onQueue: () => void } | null;
}

/**
 * TermWeave's change to Orca: while the agent works, the round button still sends (into the queue in
 * queue mode, as the Queue button did) and Stop is its own smaller control beside it. In Orca the round
 * button turned into Stop, so a habitual tap meant to send a follow-up stopped the agent. The layout
 * stays the same while the box fills or empties: an empty box only disables the round button.
 */
function controlsOf(parts: ComposerFrameParts): Controls {
  if (parts.isWorking) {
    return {
      primary: { kind: "send", disabled: parts.sendDisabled, onSend: parts.send, queues: parts.queueMode },
      stop: { disabled: !parts.connected, onStop: parts.onAbort },
      queue: null,
    };
  }
  // hold mode without a working agent: TermWeave's Hold button alone, as before
  if (parts.queueMode) return { primary: null, stop: null, queue: { disabled: parts.sendDisabled, onQueue: parts.send } };
  return { primary: { kind: "send", disabled: parts.sendDisabled, onSend: parts.send }, stop: null, queue: null };
}

function hasNotices(parts: ComposerFrameParts): boolean {
  return parts.uploading || !parts.connected || Boolean(parts.note) || parts.hint !== null || Boolean(parts.suggestionChip) || Boolean(parts.quickReplies);
}

function Notices({ parts }: { parts: ComposerFrameParts }) {
  const t = useT();
  const waiting = parts.uploading || !parts.connected;
  return (
    <>
      {parts.suggestionChip}
      {parts.quickReplies}
      {waiting ? (
        <p role="status" className="px-1 text-xs text-chat-foreground-faint">
          {t(parts.uploading ? "Uploading file…" : "Reconnecting… Keep typing; you can send once it reconnects.")}
        </p>
      ) : null}
      {/* an info note reports (polite, dim); an error note refuses or fails (assertive, red) */}
      {parts.note ? (
        <p role={parts.noteTone === "info" ? "status" : "alert"}
          className={`px-1 text-xs [overflow-wrap:anywhere] ${parts.noteTone === "info" ? "text-chat-foreground-faint" : "text-destructive"}`}>{parts.note}</p>
      ) : null}
      {!parts.note && parts.hint !== null ? <p className="px-1 text-xs text-chat-foreground-faint">{parts.hint}</p> : null}
    </>
  );
}

function OrcaComposerFrame({ parts, attach, modelControl }: { parts: ComposerFrameParts; attach: boolean; modelControl?: ModelControl }) {
  const t = useT();
  const context = parts.metadata?.context;
  const readouts = (
    <>
      {parts.backgroundTasks}
      {context ? <ContextRing used={context.used} window={context.window} /> : null}
      {modelControl
        ? modelControl({ model: parts.metadata?.model ?? null, effort: parts.metadata?.reasoning_effort ?? null })
        : <ModelChip model={parts.metadata?.model ?? null} effort={parts.metadata?.reasoning_effort ?? null} />}
    </>
  );
  const menus = (
    <>
      {/* lib/frontendReloadSafety.ts asks before a reload while this class is on the page */}
      {parts.attachments.length > 0 ? <span className="composer-attachments" style={{ display: "none" }} /> : null}
      {parts.resizeGrip}
      {attach ? parts.fileInput : null}
      {parts.menuState.open ? (
        <CommandMenu id={parts.menuState.id} label={parts.menuState.label} groups={parts.menuState.groups}
          selectedIndex={parts.menuState.selectedIndex} onChoose={parts.menuState.choose} />
      ) : null}
    </>
  );
  return (
    <ComposerFrame
      className="composer is-framed"
      label={t("Message composer")}
      input={parts.textarea}
      menus={menus}
      notices={hasNotices(parts) ? <Notices parts={parts} /> : undefined}
      attachments={parts.attachments.map((attachment) => (
        <AttachmentChip key={attachment.id} name={attachment.name} previewUrl={attachment.previewUrl} state={attachment.state} onRemove={attachment.remove} />
      ))}
      footer={parts.dictation.recordingPill || undefined}
      dragging={parts.dragging}
      onDragEnter={parts.onDragEnter}
      onDragOver={parts.onDragOver}
      onDragLeave={parts.onDragLeave}
      onDrop={parts.onDrop}
      actions={
        <ComposerActions
          attach={attach ? { disabled: !parts.connected || parts.uploading, onAttach: parts.openFilePicker } : null}
          voice={parts.dictation.shown ? parts.dictation.micButton : undefined}
          readouts={readouts}
          labels={parts.labels}
          {...controlsOf(parts)}
        />
      }
    />
  );
}
