// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/NativeChatStructuredSession.tsx
// and NativeChatDock.tsx (the column: transcript, dock, prompt card, queue, composer), as src/orca/chat/OrcaChat.tsx
// composes it; adapted for TermWeave. The chat of a bot that runs as a session (no terminal), drawn from its journal.
import { useCallback, useMemo } from "react";

import type { BotChatStatus } from "../../../../shared/bots/chat.ts";
import type { AgentStatus } from "../../../../shared/protocol.ts";
import { useT, type Translate } from "../../../lib/i18n.ts";
import { useSettings } from "../../../lib/settings.ts";
import { BotAvatar } from "../../bots/BotAvatar.tsx";
import { useChatScrollBinding } from "../adapter/use-conversation-feed.ts";
import { useChatBotParts, type RenderApproval } from "../bot/index.ts";
import { OrcaComposer } from "../composer/index.ts";
import { ChatImages, ChatMarkdown } from "../markdown/index.ts";
import { ApprovalCard } from "../prompts/index.ts";
import { ChatRoot, ChatSlotsContext, type ChatFeed, type ChatSlots, type ChatTurnState } from "../shared/index.ts";
import { ToolRun } from "../tools/index.ts";
import { ChatTranscript } from "../transcript/index.ts";
import type { ChatHold } from "./rows-to-messages.ts";
import { SessionPromptSlot } from "./SessionPromptSlot.tsx";
import { SessionQueue } from "./SessionQueue.tsx";
import { useSessionFeed } from "./use-session-feed.ts";

const SLOTS: ChatSlots = { Markdown: ChatMarkdown, Images: ChatImages, ToolRun };
const LINE_CLASS = "mx-auto w-full max-w-(--chat-content-max-width) shrink-0 px-4 py-1 text-xs [overflow-wrap:anywhere]";

export interface SessionChatProps {
  botId: string;
  /** a watching device: no composer, no answers */
  readOnly: boolean;
  /** the server connection is up (the composer says so when it is not) */
  connected: boolean;
}

/**
 * The server's chat status as the composer's agent status. Decision: only `working` shows the working
 * indicator and Stop; `blocked` and `waiting` show as blocked (a card waits on the owner, not the bot);
 * `done` and `offline` are idle, since a closed session starts again on the next message.
 */
function agentStatusOf(status: BotChatStatus | null): AgentStatus | undefined {
  switch (status) {
    case "working": return "working";
    case "blocked": case "waiting": return "blocked";
    case "done": case "offline": return "idle";
    default: return undefined;
  }
}

function turnState(feed: ChatFeed, agentStatus: AgentStatus | undefined): ChatTurnState {
  const working = agentStatus === "working";
  const lastUser = working ? [...feed.messages].reverse().find((message) => message.role === "user") : undefined;
  return { working, startedAt: lastUser?.timestamp ?? null, agentStatus };
}

/** The line for a hold the host reported; the host's own text is the title, for the detail. */
function holdLine(hold: ChatHold, t: Translate): { text: string; error: boolean } {
  switch (hold.kind) {
    case "slot": return { text: t("Waiting for a free chat slot: other bot chats are busy. Your message is kept and goes when one finishes."), error: false };
    case "stopped": return { text: t("Stopped after failed starts. Send a message or change a setting to try again."), error: true };
    case "start-failed": return { text: t("The bot's Claude could not start. It tries again with the next message."), error: true };
    case "pane": return { text: hold.text, error: false };
  }
}

/** Orca's empty chat: the bot's picture and what to do first. */
function SessionEmpty({ name, bot }: { name: string; bot: { id: string; avatar?: string | null } | null }) {
  const t = useT();
  return (
    <div className="relative min-h-[min(max(160px,40cqh),60cqh)] flex-1">
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        {bot ? <BotAvatar bot={bot} className="size-8 rounded-md" /> : null}
        <p className="text-sm text-chat-foreground-faint">{t("Say what you want {name} to do.", { name })}</p>
      </div>
    </div>
  );
}

/** The quiet lines between the transcript and the composer: connection, a closed session, a hold, a failed Stop. */
function StatusLines({ connected, status, hold, stopError }: { connected: boolean; status: BotChatStatus | null; hold: ChatHold | null; stopError: string | null }) {
  const t = useT();
  const held = hold === null ? null : holdLine(hold, t);
  return (
    <>
      {!connected ? <p role="status" className={`${LINE_CLASS} text-chat-foreground-faint`}>{t("reconnecting…")}</p> : null}
      {held !== null ? (
        <p role={held.error ? "alert" : "status"} title={hold?.text} data-session-hold={hold?.kind}
          className={`${LINE_CLASS} ${held.error ? "text-destructive" : "text-chat-foreground-faint"}`}>{held.text}</p>
      ) : null}
      {held === null && status === "offline" ? (
        <p role="status" data-session-offline="" className={`${LINE_CLASS} text-chat-foreground-faint`}>{t("This chat is closed. It starts again with your next message.")}</p>
      ) : null}
      {stopError !== null ? <p role="alert" className={`${LINE_CLASS} text-destructive`}>{stopError}</p> : null}
    </>
  );
}

/** Fills its parent (`absolute inset-0` inside a positioned box, as OrcaChat does). */
export function SessionChat({ botId, readOnly, connected }: SessionChatProps) {
  const t = useT();
  const { settings } = useSettings();
  const scroll = useChatScrollBinding();
  const session = useSessionFeed(botId, scroll);
  // Settings › Show thinking off: reasoning rows stay out, as in OrcaChat
  const shown = useMemo<ChatFeed>(
    () => (settings.showThinking ? session.feed : { ...session.feed, messages: session.feed.messages.filter((message) => message.role !== "reasoning") }),
    [session.feed, settings.showThinking],
  );
  const renderApproval = useCallback<RenderApproval>(({ approval, submitting, submittingIndex, error, onChoose }) => (
    <ApprovalCard approval={approval} submitting={submitting} submittingIndex={submittingIndex} error={error} shouldFocus={false} onChoose={onChoose} placement="stacked" />
  ), []);
  const bot = useChatBotParts({ botId, readOnly, messages: shown.messages, renderApproval });
  const agentStatus = agentStatusOf(session.status);
  const turn = useMemo(() => turnState(shown, agentStatus), [shown, agentStatus]);
  // no tool output is cut by reference in the journal, so nothing asks for this; it refuses plainly if something does
  const loadFullOutput = useCallback(async (): Promise<string> => { throw new Error(t("The full output is not available for this bot.")); }, [t]);
  // no route takes an image for a session bot: the composer draws no attach control, and a pasted or dropped image is refused
  const onUploadImage = useCallback(async (): Promise<string> => { throw new Error(t("Images cannot be sent to this bot yet.")); }, [t]);
  const name = bot.context?.bot.name ?? "";
  // the owner's own message is at the end: sending goes there, as the pane chat does on a send
  const { send } = session;
  const onSend = useCallback((text: string) => {
    scroll.stickToBottom.current = true;
    const node = scroll.scroller.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
    return send(text);
  }, [scroll, send]);
  return (
    <ChatRoot historyId={session.feed.historyId} className="absolute inset-0 z-[1]">
      <ChatSlotsContext.Provider value={SLOTS}>
        <div data-orca-chat="" data-session-chat={botId} className="flex min-h-0 flex-1 flex-col">
          {shown.status === "empty"
            ? <SessionEmpty name={name} bot={bot.context?.bot ?? null} />
            : <ChatTranscript feed={shown} turn={turn} agentName="claude" timedRows={bot.timedRows} renderTimedRow={bot.renderTimedRow}
                loadFullOutput={loadFullOutput} scroll={scroll} />}
          <StatusLines connected={connected} status={session.status} hold={session.hold} stopError={session.stopError} />
          {bot.dock}
          <SessionPromptSlot prompts={session.prompts} readOnly={readOnly} answer={session.answer} />
          <SessionQueue entries={session.queue} />
          {readOnly ? null : (
            <div className="session-chat-composer contents">
              {/* drafts are kept per bot: the composer keys them by this id */}
              <OrcaComposer paneId={`bot:${botId}`} connected={connected} agent="claude" agentStatus={agentStatus}
                attach={false} completions={false} onSend={onSend} onAbort={session.stop} onUploadImage={onUploadImage} />
            </div>
          )}
        </div>
      </ChatSlotsContext.Provider>
    </ChatRoot>
  );
}
