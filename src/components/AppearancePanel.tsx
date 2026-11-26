import { useEffect, useRef, useState } from "react";
import { useSettings } from "../lib/settings.ts";
import { COLOR_KEYS, CUSTOM_DEFAULT, FONT_CATALOG, appearanceColors, contrast, parseAppearance, preset } from "../lib/appearance.ts";
import { FONT_FAMILY_MAX_CHARS, sanitizeFontFamily, terminalFontStack } from "../lib/fontFamily.ts";
import { migrateUpstreamPreferences } from "../lib/migrateStorage.ts";
import { ColorPicker } from "./ColorPicker.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { useT } from "../lib/i18n.ts";
import "./AppearancePanel.css";

/** The theme preset and its colors: the colors to edit appear once the preset is Custom. */
export function AppearancePanel(){
 const {settings,update,resolvedTheme}=useSettings();const t=useT();const [editing,setEditing]=useState<typeof COLOR_KEYS[number]>("accent");
 const active=appearanceColors(settings.appearancePreset,resolvedTheme,settings.customColors);
 const labels={background:t("Background"),surface:t("Panel background"),text:t("Text color"),accent:t("Accent color"),border:t("Border color")};
 return <div className="appearance-panel">
  <label>{t("Open-source themes")}<select aria-label={t("Open-source themes")} className="input" value={settings.appearancePreset} onChange={e=>update({appearancePreset:preset(e.target.value)})}>
   <option value="default">TermWeave</option><option value="catppuccin">{t("Catppuccin themes: Mocha / Latte")}</option><option value="rose-pine">{t("Rosé Pine themes: Main / Dawn")}</option><option value="custom">{t("Custom colors")}</option>
  </select></label>
  <p className="settings-description">{t("Theme colors follow dark or light mode. Fonts are served locally; no external font service is contacted.")}</p>
  {settings.appearancePreset!=='custom'&&<button className="btn" onClick={()=>update({appearancePreset:'custom',customColors:{...(active??CUSTOM_DEFAULT)}})}>{t("Customize these colors")}</button>}
  {settings.appearancePreset==='custom'&&<>
   <div className="appearance-colors" role="radiogroup" aria-label={t("Color to edit")}>{COLOR_KEYS.map(key=><button key={key} type="button" role="radio" aria-checked={editing===key} className="appearance-swatch" onClick={()=>setEditing(key)}>
    <span className="appearance-swatch-chip" style={{backgroundColor:settings.customColors[key]}} aria-hidden="true"/><span>{labels[key]}</span><code>{settings.customColors[key]}</code></button>)}</div>
   <ColorPicker label={labels[editing]} value={settings.customColors[editing]} onChange={hex=>update({customColors:{...settings.customColors,[editing]:hex}})}/>
  </>}
  {active&&contrast(active)<4.5&&<p role="status">{t("Text contrast is low. Choose more distinct text and panel colors.")}</p>}
 </div>;
}

/**
 * The rarely used appearance tools, closed by default: export, import, reset, the herdr-web import,
 * and the font and theme licenses. Reset and the herdr-web import ask first and say what changes.
 */
export function AppearanceMore() {
  const { settings, update } = useSettings();
  const t = useT();
  const [error, setError] = useState("");
  const [asking, setAsking] = useState<"reset" | "upstream" | null>(null);
  const exportTheme = () => {
    const data = { version: 1, appearancePreset: settings.appearancePreset, customColors: settings.customColors, uiFontFamily: settings.uiFontFamily, terminalFontFamily: settings.terminalFontFamily, chatFontFamily: settings.chatFontFamily, theme: settings.theme };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "termweave-appearance.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importTheme = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 16000) throw Error();
      const { version, ...data } = parseAppearance(await file.text());
      update({ ...data, uiFontFamily: sanitizeFontFamily(data.uiFontFamily), terminalFontFamily: sanitizeFontFamily(data.terminalFontFamily), chatFontFamily: sanitizeFontFamily(data.chatFontFamily) });
      setError("");
    } catch { setError(t("Invalid appearance file")); }
    input.value = "";
  };
  return (
    <details className="appearance-more">
      <summary>{t("More appearance options")}</summary>
      <div className="appearance-actions">
        <button type="button" className="btn" onClick={exportTheme}>{t("Export appearance")}</button>
        <label className="btn">{t("Import appearance")}<input className="visually-hidden" type="file" accept="application/json,.json" onChange={(e) => void importTheme(e.currentTarget)} /></label>
        <button type="button" className="btn" onClick={() => setAsking("reset")}>{t("Reset appearance customization")}</button>
        <button type="button" className="btn" onClick={() => setAsking("upstream")}>{t("Import herdr-web settings")}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <details><summary>{t("Sources and licenses")}</summary><a href="https://github.com/catppuccin/catppuccin" target="_blank" rel="noreferrer">{t("Catppuccin source")}</a> · <a href="/appearance/Catppuccin-LICENSE.txt" target="_blank" rel="noreferrer">{t("MIT license")}</a><br/><a href="https://github.com/rose-pine/rose-pine-theme" target="_blank" rel="noreferrer">{t("Rosé Pine source")}</a> · <a href="/appearance/RosePine-LICENSE.txt" target="_blank" rel="noreferrer">{t("MIT license")}</a>{FONT_CATALOG.map(f=><div key={f.name}><a href={f.source} target="_blank" rel="noreferrer">{f.name}</a> · <a href={f.license} target="_blank" rel="noreferrer">{t("Open Font License")}</a></div>)}</details>
      {asking === "reset" && <ConfirmDialog
        title={t("Reset appearance?")}
        body={t("Colors go back to the TermWeave theme, and the interface, terminal and chat fonts go back to the defaults. Dark or light mode, text sizes and other settings stay.")}
        confirmLabel={t("Reset appearance")}
        onClose={() => setAsking(null)}
        onConfirm={async () => { update({ appearancePreset: "default", customColors: { ...CUSTOM_DEFAULT }, uiFontFamily: "", terminalFontFamily: "", chatFontFamily: "" }); setAsking(null); }}
      />}
      {asking === "upstream" && <ConfirmDialog
        title={t("Import herdr-web settings?")}
        body={t("Copies the layout and settings that herdr-web saved in this browser. Sign-ins are never copied, and anything TermWeave already saved stays as it is. The app reloads afterwards.")}
        confirmLabel={t("Import settings")}
        onClose={() => setAsking(null)}
        onConfirm={async () => { migrateUpstreamPreferences(localStorage, true); window.location.reload(); }}
      />}
    </details>
  );
}

const FONT_FAMILY_PLACEHOLDER = 'D2Coding, "Cascadia Mono"';

/**
 * A font family list, saved when the field is left, on Enter or when the dialog closes: saving
 * every keystroke would sanitize away the comma or space being typed, and each change of the
 * terminal's font refits the grid and resizes the pane.
 */
export function FontFamilyInput({ value, label, onCommit }: { value: string; label: string; onCommit: (family: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (): void => {
    const next = sanitizeFontFamily(draft);
    setDraft(next);
    if (next !== value) onCommit(next);
  };
  // closing the dialog with Escape unmounts the field without a blur
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);
  return (
    <input
      className="input settings-font-input"
      value={draft}
      placeholder={FONT_FAMILY_PLACEHOLDER}
      maxLength={FONT_FAMILY_MAX_CHARS}
      aria-label={label}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // an IME keeps its Enter, including the committing one WebKit can send after compositionend as key code 229
        if (event.key !== "Enter" || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        event.preventDefault();
        commit();
      }}
    />
  );
}

type FontKey = "uiFontFamily" | "terminalFontFamily" | "chatFontFamily";

/**
 * One font setting as one control: a list of the bundled fonts, whose "Custom font family" choice
 * opens a field for any family list this device has.
 */
export function FontFamilyField({ fontKey, label, customLabel }: { fontKey: FontKey; label: string; customLabel: string }) {
  const { settings, update } = useSettings();
  const t = useT();
  const value = settings[fontKey];
  const listed = value === "" || FONT_CATALOG.some((font) => font.family === value);
  const [custom, setCustom] = useState(!listed);
  useEffect(() => { if (!listed) setCustom(true); }, [listed]);
  const choice = custom ? "custom" : value;
  return (
    <div className="settings-font-choice">
      <select aria-label={label} className="input settings-select" value={choice} onChange={(event) => {
        const next = event.target.value;
        if (next === "custom") { setCustom(true); return; }
        setCustom(false);
        update({ [fontKey]: next });
      }}>
        <option value="">{t("Default")}</option>
        {FONT_CATALOG.filter((font) => fontKey !== "terminalFontFamily" || font.kind === "mono").map((font) => <option key={font.name} value={font.family}>{font.name}</option>)}
        <option value="custom">{t("Custom font family")}</option>
      </select>
      {custom && <FontFamilyInput value={value} label={customLabel} onCommit={(family) => update({ [fontKey]: family })} />}
    </div>
  );
}

/** How the three fonts look, under the font controls. */
export function FontPreview() {
  const { settings } = useSettings();
  const t = useT();
  return <div className="appearance-sample">{t("Font preview")} · {t("Sample text: ABC 0123")}<br/><code style={{ fontFamily: terminalFontStack(settings.terminalFontFamily) }}>{t("Terminal sample: P3 $ git status")}</code></div>;
}
