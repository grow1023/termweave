// The chat's shared folder: the contract every package builds against (SPEC 5.1 and 5.1a).
// Importing this folder also loads chat.css.
import "./chat.css";

export type * from "./types.ts";
export {
  disclosureKey,
  isImageRefBlock,
  isTextBlock,
  isToolBlock,
  isToolCallBlock,
  isToolResultBlock,
} from "./blocks.ts";
export { ChatSlotsContext, fallbackChatSlots, useChatSlots } from "./slots.tsx";
export { ChatDisclosureProvider, MAX_CHAT_DISCLOSURES, useDisclosure, type ChatDisclosure } from "./disclosure.tsx";
export { Expandable } from "./Expandable.tsx";
export { ChatRoot } from "./ChatRoot.tsx";
