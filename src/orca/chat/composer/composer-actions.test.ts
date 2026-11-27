import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SettingsProvider } from "../../../lib/settings.ts";
import { TooltipProvider } from "../../ui/tooltip.tsx";
import { ComposerActions, type ComposerActionsProps } from "./ComposerActions.tsx";

const labels = { stop: "Stop", hold: "Hold", holdTitle: "Hold this message.", holdAria: "Hold message" };
/** English, with no stored settings: the same setup as src/components/TeamFolders.test.ts. */
function html(attach: ComposerActionsProps["attach"]): string {
  const languages = Object.getOwnPropertyDescriptor(navigator, "languages");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["en"] });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: () => null } } });
  try {
    return renderToStaticMarkup(createElement(SettingsProvider, {
      children: createElement(TooltipProvider, null,
        createElement(ComposerActions, { attach, labels, primary: { kind: "send", disabled: false, onSend: () => {} } })),
    }));
  } finally {
    if (languages) Object.defineProperty(navigator, "languages", languages);
    else Reflect.deleteProperty(navigator, "languages");
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

describe("ComposerActions attach", () => {
  test("the pane chat's composer draws its attach button", () => {
    expect(html({ disabled: false, onAttach: () => {} })).toContain('aria-label="Attach files"');
  });

  test("with no attach, no attach control is drawn and Send still is", () => {
    const markup = html(null);
    expect(markup).not.toContain("Attach files");
    expect(markup).toContain('aria-label="Send message"');
  });
});
