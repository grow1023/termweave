// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/NativeChatStructuredSession.tsx
// and NativeChatDock.tsx (the column: transcript, dock, prompt card, queue, composer); adapted for TermWeave.
// The integrator's mount (SPEC-native-chat 6.1): TermWeave's feed, prompt and queue in Orca's chat look.
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ChatViewProps } from "../../components/ChatView.tsx";
import type { ComposerProps } from "../../components/Composer.tsx";
import { PromptCard } from "../../components/PromptCard.tsx";
import { ApiError } from "../../lib/api.ts";
import { useT } from "../../lib/i18n.ts";
import { useMachineApi, useMachineId } from "../../lib/machineContext.tsx";
import { useSettings } from "../../lib/settings.ts";
import { machinePath } from "../../../shared/machines.ts";
import { useChatBotParts } from "./bot/index.ts";
import type { RenderApproval } from "./bot/index.ts";
import { OrcaComposer, QueuedMessages, type QueuedMessagesProps } from "./composer/index.ts";
import { ChatImages, ChatMarkdown } from "./markdown/index.ts";
import { ApprovalCard, ChatPromptCard, toChatPrompt, toPromptAnswer } from "./prompts/index.ts";
import { ChatRoot, ChatSlotsContext, type ChatFeed, type ChatPromptAnswer, type ChatSlots, type ChatTurnState } from "./shared/index.ts";
import { ToolRun } from "./tools/index.ts";
import { ChatTranscript, useChatScrollBinding, useConversationFeed, usePromptState } from "./transcript/index.ts";

const SLOTS: ChatSlots = { Markdown: ChatMarkdown, Images: ChatImages, ToolRun };

export interface OrcaChatProps extends ChatViewProps {
  /** null: observing, ended, or a secret input owns the bottom. */
  composer: Omit<ComposerProps, "renderFrame"> | null;
  queue: QueuedMessagesProps | null;
  readOnly: boolean;
  /** Opens the terminal lens; unset, the chat offers no such button. */
  onShowTerminal?: () => void;
}

/** The whole output of a cut tool result, by the same call ChatView's rows use. */
function useLoadFullOutput(paneId: string): (ref: string) => Promise<string> {
  const machineId = useMachineId();
  return useCallback(async (ref: string) => {
    const url = machinePath(machineId, `pane/conversation/tool-output?${new URLSearchParams({ pane_id: paneId, ref }).toString()}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    return response.text();
  }, [machineId, paneId]);
}

/** ChatView's prompt reading, handed up the same way: PaneTerminal's composer answers it too. */
function usePromptBridge(props: OrcaChatProps) {
  const { paneId, connected, ended, agent, onPrompt, onSuggestion, sentKey = 0, promptRefreshKey = 0 } = props;
  const [poll, setPoll] = useState(0);
  const state = usePromptState(paneId, promptRefreshKey + poll, connected && !ended && agent !== null, sentKey);
  useEffect(() => {
    onPrompt?.(paneId, state.prompt);
    return () => onPrompt?.(paneId, null);
  }, [onPrompt, paneId, state.prompt]);
  useEffect(() => { onSuggestion?.(paneId, state.suggestion); }, [onSuggestion, paneId, state.suggestion]);
  // a message went out: the suggestion was for the turn before it
  useEffect(() => { if (sentKey > 0) onSuggestion?.(paneId, null); }, [onSuggestion, paneId, sentKey]);
  useEffect(() => () => onSuggestion?.(paneId, null), [onSuggestion, paneId]);
  const refresh = useCallback(() => setPoll((key) => key + 1), []);
  return { prompt: state.prompt, refresh };
}

/** The card for the agent's waiting prompt: Orca's card, or TermWeave's while a typed pick waits for Confirm. */
function PromptSlot({ props, prompt, refresh }: { props: OrcaChatProps; prompt: NonNullable<ReturnType<typeof usePromptBridge>["prompt"]>; refresh: () => void }) {
  const t = useT();
  const { answerPanePrompt } = useMachineApi();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatPrompt = useMemo(() => toChatPrompt(prompt), [prompt]);
  const { paneId, pendingAnswer, onPendingAnswerDone } = props;
  useEffect(() => { setError(null); }, [prompt.id]);
  if (pendingAnswer && pendingAnswer.promptId === prompt.id) {
    return (
      <div className="mx-auto w-full max-w-(--chat-content-max-width) shrink-0 px-3 pt-2 sm:px-4">
        <PromptCard paneId={paneId} prompt={prompt} typedAnswer={pendingAnswer.answer} onTypedAnswerDone={onPendingAnswerDone}
          onPromptChanged={refresh} onAnswered={() => { refresh(); onPendingAnswerDone?.(); }} />
      </div>
    );
  }
  const answer = (choice: ChatPromptAnswer): void => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    void Promise.resolve()
      .then(() => answerPanePrompt(toPromptAnswer(chatPrompt, choice, paneId)))
      .then(() => { onPendingAnswerDone?.(); refresh(); })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 409 && cause.code === "prompt_changed") {
          setError(t("The prompt changed — read it again"));
          refresh();
        } else setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setSubmitting(false));
  };
  return (
    // shrinks (its card scrolls inside) rather than push the composer out: the transcript above keeps its floor
    <div className="flex min-h-0 shrink flex-col" data-orca-chat-prompt="">
      <ChatPromptCard prompt={chatPrompt} submitting={submitting} error={error} shouldFocus={false} onAnswer={answer} onOpenTerminal={props.onShowTerminal} />
    </div>
  );
}

function turnState(feed: ChatFeed, agentStatus: OrcaChatProps["agentStatus"]): ChatTurnState {
  const working = agentStatus === "working";
  const lastUser = working ? [...feed.messages].reverse().find((message) => message.role === "user") : undefined;
  return { working, startedAt: lastUser?.timestamp ?? null, agentStatus };
}

/** Orca's chat for one pane: transcript, bot dock, prompt card, queue and composer in one column. */
export function OrcaChat(props: OrcaChatProps) {
  const t = useT();
  const { paneId, refreshKey, sentKey = 0, connected, ended, agent, agentStatus, onMetadata, readOnly } = props;
  const { settings } = useSettings();
  const scroll = useChatScrollBinding();
  const feed = useConversationFeed({ paneId, refreshKey, sentKey, connected, ended, agentStatus, onMetadata, scroll });
  // Settings › Show thinking off: reasoning rows stay out, as in ChatView
  const shown = useMemo<ChatFeed>(
    () => (settings.showThinking ? feed : { ...feed, messages: feed.messages.filter((message) => message.role !== "reasoning") }),
    [feed, settings.showThinking],
  );
  const { prompt, refresh } = usePromptBridge(props);
  const loadFullOutput = useLoadFullOutput(paneId);
  const renderApproval = useCallback<RenderApproval>(({ approval, submitting, submittingIndex, error, onChoose }) => (
    <ApprovalCard approval={approval} submitting={submitting} submittingIndex={submittingIndex} error={error} shouldFocus={false} onChoose={onChoose} placement="stacked" />
  ), []);
  const bot = useChatBotParts({ paneId, readOnly, messages: shown.messages, renderApproval });
  const turn = useMemo(() => turnState(shown, agentStatus), [shown, agentStatus]);
  return (
    <ChatRoot historyId={feed.historyId} className="absolute inset-0 z-[1]">
      <ChatSlotsContext.Provider value={SLOTS}>
        <div data-orca-chat="" className="flex min-h-0 flex-1 flex-col">
          <ChatTranscript feed={shown} turn={turn} agentName={agent ?? "agent"} timedRows={bot.timedRows} renderTimedRow={bot.renderTimedRow}
            loadFullOutput={loadFullOutput} onShowTerminal={props.onShowTerminal} scroll={scroll} />
          {ended || !connected ? (
            <p role="status" className="mx-auto w-full max-w-(--chat-content-max-width) shrink-0 px-4 py-1 text-xs text-chat-foreground-faint">
              {ended ? t("terminal ended") : t("reconnecting…")}
            </p>
          ) : null}
          {bot.dock}
          {prompt !== null && !readOnly ? <PromptSlot props={props} prompt={prompt} refresh={refresh} /> : null}
          {props.queue ? <QueuedMessages {...props.queue} /> : null}
          {/* lib/frontendReloadSafety.ts asks before a reload while this class is on the page */}
          {props.queue && props.queue.messages.length > 0 ? <span className="composer-queue" style={{ display: "none" }} /> : null}
          {props.composer ? <OrcaComposer {...props.composer} /> : null}
        </div>
      </ChatSlotsContext.Provider>
    </ChatRoot>
  );
}
