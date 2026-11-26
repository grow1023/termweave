// A session bot in the main area, where a terminal bot's pane would be: its chat (drawn from the bot's
// journal, no terminal) with its Home panel beside it on a wide page, or as a sheet opened from its
// picture on a narrow one. The panel is BotSide, the same one a terminal bot's chat has.
import { SessionChat } from "../chat/session/SessionChat.tsx";
import { BotSide } from "./BotSide.tsx";
import "./bot-side.css";

export function BotPage({ botId, readOnly, connected }: { botId: string; readOnly: boolean; connected: boolean }) {
  // the stack is the box BotSide measures and docks into, as in a pane's chat lens (PaneTerminal.tsx)
  return (
    <div className="terminal-stack is-chat bot-page" data-bot-page={botId}>
      <BotSide botId={botId} readOnly={readOnly} />
      <div className="terminal-surface">
        <SessionChat key={botId} botId={botId} readOnly={readOnly} connected={connected} />
      </div>
    </div>
  );
}
