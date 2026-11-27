// TermWeave's own: the label a notice row shows. Pure: no React.
import type { Translate } from "../../../lib/i18n.ts";
import type { NativeChatTextBlock } from "../shared/index.ts";

/**
 * A notice text block that names who sent it. A session bot's chat builds one for TermWeave mail (a
 * worker's report, a schedule that fired, an item answer): `noticeLabel` is the mail's own label, or
 * null when the mail has none. The pane chat's notices have no such field.
 */
export interface LabelledNoticeBlock extends NativeChatTextBlock {
  noticeLabel: string | null;
}

export function isLabelledNotice(block: NativeChatTextBlock): block is LabelledNoticeBlock {
  return "noticeLabel" in block;
}

/**
 * The notice row's label. Decision: the pane chat's notices keep Orca's "Background result delivered";
 * TermWeave mail shows its own label as plain text (it is data, never a translation key), and mail
 * without a label shows a neutral one.
 */
export function noticeLabel(block: NativeChatTextBlock, t: Translate): string {
  if (!isLabelledNotice(block)) return t("Background result delivered");
  const own = block.noticeLabel?.trim() ?? "";
  return own === "" ? t("TermWeave message") : own;
}
