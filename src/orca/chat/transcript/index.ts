// WP1: transcript and adapter (SPEC-native-chat 5.2). The adapter's names are re-exported here, as the
// spec lists them under transcript/index.ts.
export {
  LOCKED_ERROR,
  turnsToMessages,
  useChatScrollBinding,
  useConversationFeed,
  usePromptState,
  type ChatScrollBinding,
  type PromptState,
  type TurnsToMessagesContext,
  type UseConversationFeedArgs,
} from "../adapter/index.ts";
export { ChatTranscript, type ChatTranscriptProps } from "./ChatTranscript.tsx";
export { CopyButton } from "./CopyButton.tsx";
export { MessageTimestamp } from "./MessageTimestamp.tsx";
export { DividerRow } from "./NoticeRow.tsx";
