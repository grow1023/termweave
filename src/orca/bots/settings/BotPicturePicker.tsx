// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/bots/BotPicturePicker.tsx, NewBotPictureButton.tsx, BotPictureButton.tsx and BotPictureLook.tsx; adapted for TermWeave.
// The picture picker: TermWeave's twenty beasts of myth. No uploads, outfits, tile colours or generated faces.
import { Pencil } from "lucide-react";
import { useState } from "react";

import { BOT_MASCOT_IDS, botMascot, type BotMascotId } from "../../../../shared/bots/avatar.ts";
import { mascotSrc } from "../../../components/BotVisuals.tsx";
import { useT } from "../../../lib/i18n.ts";
import { cn } from "../../cn.ts";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover.tsx";
import { BotAvatarTile } from "../BotAvatar.tsx";

export interface PictureChoice {
  /** `mascot:<id>` */
  avatar: string;
}

/** The beasts of myth; a pick is reported at once. */
export function PictureChoices({ value, onPick }: { value: PictureChoice; onPick: (next: PictureChoice) => void }) {
  const t = useT();
  const mascot = botMascot({ id: "", avatar: value.avatar });
  const name = (id: BotMascotId): string => {
    switch (id) {
    case "haetae": return t("Haetae");
    case "dragon": return t("Dragon");
    case "phoenix": return t("Phoenix");
    case "kumiho": return t("Nine-tailed fox");
    case "bulgasari": return t("Bulgasari");
    case "qilin": return t("Qilin");
    case "kraken": return t("Kraken");
    case "griffin": return t("Griffin");
    case "hydra": return t("Hydra");
    case "cerberus": return t("Cerberus");
    case "minotaur": return t("Minotaur");
    case "chimera": return t("Chimera");
    case "pegasus": return t("Pegasus");
    case "basilisk": return t("Basilisk");
    case "sphinx": return t("Sphinx");
    case "fenrir": return t("Fenrir");
    case "jormungandr": return t("Jormungandr");
    case "thunderbird": return t("Thunderbird");
    case "manticore": return t("Manticore");
    case "cyclops": return t("Cyclops");
    }
  };
  return (
    <div role="group" aria-label={t("Picture")} className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
      {BOT_MASCOT_IDS.map((id) => (
        <button
          key={id}
          type="button"
          aria-label={name(id)}
          title={name(id)}
          aria-pressed={id === mascot}
          onClick={() => onPick({ avatar: `mascot:${id}` })}
          className={cn(
            "aspect-square min-h-11 w-full cursor-pointer rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            id === mascot && "ring-2 ring-foreground ring-offset-2 ring-offset-popover",
          )}
        >
          <BotAvatarTile src={mascotSrc(id)} fallback="" className="size-full rounded-[inherit]" />
        </button>
      ))}
    </div>
  );
}

/**
 * The picture as a button: a click opens the picker in a popover. `new` is the New bot dialog's big tile
 * with its pencil badge; `settings` is the settings card's small picture with a pencil on hover.
 */
export function PictureButton({ value, onPick, variant, disabled = false, label }: {
  value: PictureChoice;
  onPick: (next: PictureChoice) => void;
  variant: "new" | "settings";
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const src = mascotSrc(botMascot({ id: "", avatar: value.avatar }));
  const isNew = variant === "new";
  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          className={cn(
            "group/picture relative shrink-0 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default",
            isNew ? "size-16 rounded-[18px] focus-visible:ring-offset-2 focus-visible:ring-offset-background" : "size-8 rounded-lg pointer-coarse:size-11",
          )}
        >
          {isNew ? (
            <BotAvatarTile src={src} fallback="" className="size-16 rounded-[inherit] shadow-[0_0_0_3px_var(--dialog-surface)] transition-[filter] group-hover/picture:brightness-95" />
          ) : (
            <BotAvatarTile src={src} fallback="" className="size-8 rounded-lg text-sm pointer-coarse:size-11" />
          )}
          {isNew ? (
            <span aria-hidden className="absolute -right-1.5 -bottom-1.5 flex size-[22px] items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-[0_0_0_2px_var(--dialog-surface)] transition-colors group-hover/picture:text-foreground group-aria-expanded/picture:text-foreground">
              <Pencil className="size-3" />
            </span>
          ) : disabled ? null : (
            <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/55 text-white opacity-0 transition-opacity group-hover/picture:opacity-100 group-focus-visible/picture:opacity-100 group-aria-expanded/picture:opacity-100">
              <Pencil className="size-1/2 max-h-4 max-w-4" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={16} wheelScroll className="flex w-[min(20rem,var(--radix-popover-content-available-width))] flex-col">
        <div className="scrollbar-sleek min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain p-3">
          <PictureChoices value={value} onPick={onPick} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
