// From stablyai/orca (MIT, Copyright (c) 2026 Lovecast Inc.), src/renderer/src/components/native-chat/composer/pickers/NativeChatPickerParts.tsx and NativeChatAutocompleteMenus.tsx; adapted for TermWeave.
import { cn } from "../../cn.ts";

export interface CommandMenuOption {
  key: string;
  /** The token: `/name`, `$skill` or a file path. Shown in the code font. */
  main: string;
  hint?: string;
}

export interface CommandMenuGroup {
  key: string;
  heading: string;
  options: CommandMenuOption[];
}

export interface CommandMenuProps {
  /** The listbox id; option `n` is `${id}-${n}`, the scheme TermWeave's textarea names in aria-activedescendant. */
  id: string;
  label: string;
  /** Options are numbered across groups, in order. */
  groups: CommandMenuGroup[];
  selectedIndex: number;
  onChoose: (index: number) => void;
}

interface NumberedGroup { group: CommandMenuGroup; first: number }

function numberGroups(groups: CommandMenuGroup[]): NumberedGroup[] {
  return groups.reduce<NumberedGroup[]>((acc, group) => {
    const previous = acc.at(-1);
    const first = previous ? previous.first + previous.group.options.length : 0;
    return [...acc, { group, first }];
  }, []);
}

/**
 * The slash and @ menu as a static list above the composer column. Decision: no `@floating-ui`
 * portal (SPEC 3.1); the list sits `bottom-full` of the column, as TermWeave's menu does.
 * Choosing happens on click with the mousedown's focus move prevented, so the textarea keeps its
 * caret and a phone's scroll gesture does not pick a row (Orca picks on pointerdown).
 */
export function CommandMenu({ id, label, groups, selectedIndex, onChoose }: CommandMenuProps) {
  const numbered = numberGroups(groups.filter((group) => group.options.length > 0));
  if (numbered.length === 0) return null;
  return (
    <div
      id={id}
      role="listbox"
      aria-label={label}
      data-focus-behavior="composer-suggestions"
      className="scrollbar-sleek absolute inset-x-0 bottom-full z-50 mb-2 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-floating"
    >
      {numbered.map(({ group, first }) => (
        <div key={group.key} role="group" aria-label={group.heading} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">{group.heading}</div>
          {group.options.map((option, offset) => {
            const index = first + offset;
            const selected = index === selectedIndex;
            return (
              <button
                key={option.key}
                id={`${id}-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChoose(index)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground hover:[--muted-foreground:var(--accent-foreground)] pointer-coarse:min-h-11",
                  selected && "border-border bg-accent text-accent-foreground [--muted-foreground:var(--accent-foreground)]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block min-w-0 truncate font-mono text-chat-code font-medium">{option.main}</span>
                  {option.hint ? <span className="block truncate text-xs text-muted-foreground">{option.hint}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
