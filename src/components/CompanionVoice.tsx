// The companion's voice (SPEC F5): hold Talk (or tap to start and stop) and what was said goes as a
// question; the first two sentences of the answer are read aloud. A spoken "approve" approves nothing:
// speech only ever becomes a chat message, and an action still needs Allow on its card (F16).
// Without the microphone's permission, a row offers to ask for it and says where the setting is.
import { Mic, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { spokenSentences } from "../lib/companionVoice.ts";
import { useT } from "../lib/i18n.ts";
import { useSettings } from "../lib/settings.ts";
import { speechLang, useVoiceInput } from "../lib/voice.ts";

const SPEAK_KEY = "termweave:companion-speak";
const ANSWER_WAIT_MS = 180_000;
const MAC_MIC_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

interface ChatRow { itemId: string; body: { kind: string; role?: string; text?: string; state?: string } }

async function chatRows(id: string): Promise<ChatRow[]> {
  const response = await fetch(`/api/bots/${encodeURIComponent(id)}/chat?direction=tail&limit=60`);
  const body = await response.json().catch(() => null) as { items?: ChatRow[] } | null;
  return response.ok && Array.isArray(body?.items) ? body.items : [];
}
const lastAnswer = (rows: readonly ChatRow[]): ChatRow | undefined => [...rows].reverse().find((row) => row.body.kind === "message" && row.body.role === "assistant");

function storedSpeak(): boolean {
  try { return window.localStorage.getItem(SPEAK_KEY) !== "off"; } catch { return true; }
}

type MicHelp = null | "ask" | "blocked" | "allowed";

export function CompanionVoice({ companionId, connected, onAsk }: {
  companionId: string | null;
  connected: boolean;
  /** sends what was said as the owner's spoken message, with what they heard of an answer they cut short; false when it could not be sent */
  onAsk: (text: string, heard: string | null) => Promise<boolean>;
}) {
  const t = useT();
  const { resolvedLanguage } = useSettings();
  const [partial, setPartial] = useState("");
  const [speak, setSpeak] = useState(storedSpeak);
  const [help, setHelp] = useState<MicHelp>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = useRef(0);
  const latest = useRef({ companionId, onAsk, speak, language: resolvedLanguage });
  latest.current = { companionId, onAsk, speak, language: resolvedLanguage };

  /** the sentences of the answer being read: how many were queued, and how many the owner heard to the end */
  const saying = useRef<{ sentences: string[]; heard: number; done: boolean } | null>(null);
  /** what the owner heard of an answer they cut short, for the next spoken message */
  const cutShort = useRef<string | null>(null);
  const hush = useCallback((): void => {
    run.current += 1;
    const now = saying.current;
    // cut short while sentences were still to come: the companion is told how far the owner heard
    if (now && (!now.done || now.heard < now.sentences.length)) cutShort.current = now.sentences.slice(0, now.heard).join(" ");
    saying.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* nothing was speaking */ }
  }, []);
  useEffect(() => hush, [hush]);

  /** Reads the answer to the question just sent, sentence by sentence as it is written, not after it ends. */
  const readAnswer = useCallback(async (id: string, before: string | undefined): Promise<void> => {
    const mine = ++run.current;
    if (typeof SpeechSynthesisUtterance === "undefined" || !window.speechSynthesis) return;
    const state = { sentences: [] as string[], heard: 0, done: false };
    saying.current = state;
    const end = Date.now() + ANSWER_WAIT_MS;
    while (Date.now() < end && mine === run.current) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const rows = await chatRows(id).catch(() => [] as ChatRow[]);
      if (mine !== run.current) return;
      const from = before === undefined ? -1 : rows.findIndex((row) => row.itemId === before);
      const text = rows.slice(from + 1).filter((row) => row.body.kind === "message" && row.body.role === "assistant").map((row) => row.body.text ?? "").join(" ");
      const running = rows.some((row) => row.body.kind === "turn" && row.body.state === "running");
      const sentences = spokenSentences(text, !running);
      for (const sentence of sentences.slice(state.sentences.length)) {
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = speechLang(latest.current.language);
        utterance.onend = () => { if (saying.current === state) state.heard += 1; };
        window.speechSynthesis.speak(utterance);
      }
      state.sentences = sentences;
      // the turn is over (a waiting card keeps it running: nothing more is read until the owner answers it)
      if (!running && text !== "") { state.done = true; return; }
    }
  }, []);

  const onText = useCallback((result: { text: string; phase: "raw" | "polished" }): void => {
    const text = result.text.trim();
    const id = latest.current.companionId;
    if (result.phase !== "raw" || text === "" || id === null) return;
    setPartial("");
    void (async () => {
      const before = latest.current.speak ? lastAnswer(await chatRows(id).catch(() => []))?.itemId : undefined;
      const heard = cutShort.current;
      cutShort.current = null;
      if (await latest.current.onAsk(text, heard === "" ? null : heard) && latest.current.speak) void readAnswer(id, before);
    })();
  }, [readAnswer]);

  const voice = useVoiceInput({ mode: "chat", enabled: true, polish: false, onText, onPartial: setPartial });
  const recording = voice.state === "starting" || voice.state === "recording";
  useEffect(() => { if (voice.state === "idle") setPartial(""); }, [voice.state]);
  useEffect(() => {
    if (voice.error === "permission") { setHelp("ask"); setNote(null); }
    else if (voice.error === "no_mic") setNote(t("No microphone found"));
    else if (voice.error === "no_speech") setNote(t("No speech was heard"));
    else if (voice.error !== null) setNote(t("Transcription failed"));
  }, [voice.error, t]);

  const unavailable = voice.unavailableReason === "insecure" ? t("Voice input needs HTTPS")
    : voice.unavailableReason === "not_configured" ? t("Add an OpenAI API key in Settings > Voice input")
      : voice.unavailableReason === "unsupported" ? t("This browser cannot record audio") : null;

  const press = (): void => {
    if (unavailable !== null) { setNote(unavailable); return; }
    setNote(null);
    hush();
    voice.press();
  };
  /** Asks the browser for the microphone; a browser that already refused answers at once, with no window. */
  const allowMic = async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) { setNote(t("Voice input needs HTTPS")); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      setHelp("allowed");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotFoundError" || name === "OverconstrainedError") { setHelp(null); setNote(t("No microphone found")); } else setHelp("blocked");
    }
  };
  const toggleSpeak = (): void => {
    const next = !speak;
    setSpeak(next);
    if (!next) hush();
    try { window.localStorage.setItem(SPEAK_KEY, next ? "on" : "off"); } catch { /* until a reload */ }
  };
  const onMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) && navigator.maxTouchPoints === 0;
  const pointerUpAt = useRef(-Infinity);
  const talkLabel = recording ? t("Stop and send") : t("Talk to the companion (hold, or tap to start and stop)");
  return (
    <div className="companion-voice" data-companion-voice={voice.state}>
      <div className="companion-voice-row">
        <button type="button" className="companion-talk" data-companion-talk="" aria-pressed={recording} aria-label={talkLabel} title={talkLabel}
          disabled={companionId === null || !connected || voice.state === "transcribing"}
          onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); press(); }}
          onPointerUp={() => { pointerUpAt.current = performance.now(); if (unavailable === null) voice.release(); }}
          onPointerCancel={() => { if (unavailable === null) voice.release(); }}
          // a pointer already acted on pointerdown; this is the keyboard's press
          onClick={() => { if (performance.now() - pointerUpAt.current > 500) press(); }}>
          {recording ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
          <span>{recording ? t("Listening…") : voice.state === "transcribing" ? t("Transcribing…") : t("Talk")}</span>
        </button>
        <button type="button" role="switch" aria-checked={speak} className="companion-speak" data-companion-speak="" aria-label={t("Read answers aloud")} title={t("Read answers aloud")} onClick={toggleSpeak}>
          {speak ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        </button>
        {partial !== "" && <span className="companion-heard" aria-live="polite">{partial}</span>}
      </div>
      {note && <p className="companion-alert" role="alert">{note}</p>}
      {help !== null && (
        <div className="companion-mic-help" role="status" data-companion-mic-help={help}>
          {help === "ask" && <><span>{t("The microphone is not allowed yet.")}</span><button type="button" onClick={() => void allowMic()}>{t("Allow the microphone")}</button></>}
          {help === "allowed" && <span>{t("The microphone is allowed. Press Talk and speak.")}</span>}
          {help === "blocked" && (
            <>
              <span>{t("The browser blocks the microphone for this site. Click the icon at the left of the address bar, set Microphone to Allow, then reload the page.")}</span>
              {/* the browser asks before it opens System Settings; only a Mac has this page */}
              {onMac && <a href={MAC_MIC_SETTINGS} data-companion-mic-settings="">{t("Open macOS microphone settings")}</a>}
              <button type="button" onClick={() => void allowMic()}>{t("Try again")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
