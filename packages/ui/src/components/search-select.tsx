import { MENU_ITEM, MENU_ITEM_ACTIVE, MENU_POPOVER_SURFACE } from "@mt/ui/components/base/dropdown/menu-styles";
import { InputBase } from "@mt/ui/components/base/input/input";
import { Label } from "@mt/ui/components/base/input/label";
import { listRowVariants, listVariants } from "@mt/ui/components/card";
import { ChevronDownSmall } from "@mt/ui/components/foundations/icons/chevrons";
import { SearchInput } from "@mt/ui/components/search-input";
import { Sheet } from "@mt/ui/components/sheet";
import { useMediaQuery } from "@mt/ui/hooks/use-media-query";
import { cx } from "@mt/ui/lib/cx";
import { RiCheckLine, RiSearchLine } from "@remixicon/react";
import { useRef, useState } from "react";
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  useFilter,
} from "react-aria-components";

export type SearchSelectItem = { id: string; label: string; group?: string };

/** Items in their groups, keeping the order in which each group first appears. */
function groupItems(items: SearchSelectItem[]) {
  const groups = new Map<string, SearchSelectItem[]>();
  for (const item of items) {
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([group, groupItems]) => ({ group, items: groupItems }));
}

/**
 * A choice among many long options (the 30 data that are not published): you type to narrow the list. On a computer it
 * is an autocomplete as wide as the field; on a phone the field opens a full-screen sheet with the search on top, so the
 * long names read whole. Options can come in groups (`group`), shown as headers. Accents don't matter in the search.
 */
export function SearchSelect({
  label,
  items,
  value,
  onChange,
  placeholder = "Buscá por nombre",
  id,
  onOpen,
}: {
  label: string;
  items: SearchSelectItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
  /** Called each time the list opens (for analytics: this package doesn't send events). */
  onOpen?: () => void;
}) {
  const isPhone = useMediaQuery("(max-width: 639px)");
  return isPhone ? (
    <SheetSelect label={label} items={items} value={value} onChange={onChange} placeholder={placeholder} id={id} onOpen={onOpen} />
  ) : (
    <ComboSelect label={label} items={items} value={value} onChange={onChange} placeholder={placeholder} id={id} onOpen={onOpen} />
  );
}

type Props = {
  label: string;
  items: SearchSelectItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  id?: string;
  onOpen?: () => void;
};

function ComboSelect({ label, items, value, onChange, placeholder, id, onOpen }: Props) {
  const { contains } = useFilter({ sensitivity: "base" });
  const groupRef = useRef<HTMLDivElement>(null);
  return (
    <AriaComboBox
      id={id}
      selectedKey={value}
      onSelectionChange={(key) => key != null && onChange(String(key))}
      defaultFilter={contains}
      menuTrigger="focus"
      onOpenChange={(isOpen) => isOpen && onOpen?.()}
      allowsEmptyCollection
      className="flex flex-col gap-1.5"
    >
      <Label>{label}</Label>
      <div className="relative">
        {/* The chosen name gets selected on focus, so typing replaces it instead of adding to it. */}
        <InputBase
          groupRef={groupRef}
          leadingIcon={RiSearchLine}
          placeholder={placeholder}
          fieldClassName="pe-11"
          onFocus={(e) => e.currentTarget.select()}
        />
        <AriaButton
          aria-label={`Ver todas las opciones de ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-e-2lg text-text-action outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <ChevronDownSmall className="size-4" />
        </AriaButton>
      </div>
      {/* As wide as the whole field (not just the text box), so the long names fit in one or two lines. */}
      <AriaPopover
        triggerRef={groupRef}
        offset={4}
        style={{ width: groupRef.current?.offsetWidth }}
        className={cx(MENU_POPOVER_SURFACE, "p-2")}
      >
        <AriaListBox
          className="flex max-h-[min(360px,50dvh)] flex-col gap-1 overflow-auto outline-none"
          renderEmptyState={() => <p className="p-2 text-body-regular text-text-tertiary">No hay ninguno con ese nombre.</p>}
        >
          {/* Group titles are disabled rows, not ListBoxSection: with sections, React 19.2's development
              performance track reads a collection getter that throws and the page stops responding on the
              first search (only in development; the production build was fine). */}
          {groupItems(items).flatMap(({ group, items: groupItems }) => [
            ...(group
              ? [
                  <AriaListBoxItem
                    key={`group:${group}`}
                    id={`group:${group}`}
                    textValue={group}
                    isDisabled
                    className="px-3 pt-2 pb-1 text-caption-1-medium text-text-tertiary"
                  >
                    {group}
                  </AriaListBoxItem>,
                ]
              : []),
            ...groupItems.map((item) => (
              <AriaListBoxItem
                key={item.id}
                id={item.id}
                textValue={item.label}
                className={(state) =>
                  cx(
                    MENU_ITEM,
                    "min-h-11 px-3 text-body-regular",
                    (state.isFocused || state.isSelected) && MENU_ITEM_ACTIVE,
                    state.isSelected && "text-body-medium",
                  )
                }
              >
                {item.label}
              </AriaListBoxItem>
            )),
          ])}
        </AriaListBox>
      </AriaPopover>
    </AriaComboBox>
  );
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function SheetSelect({ label, items, value, onChange, placeholder, id, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((i) => i.id === value);
  const visible = items.filter((i) => fold(i.label).includes(fold(query.trim())));
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={id && `${id}-label`}>{label}</Label>
      <button
        type="button"
        id={id}
        aria-labelledby={id && `${id}-label ${id}`}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          onOpen?.();
        }}
        className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-1.5 rounded-2lg bg-background-action px-3 py-2.5 text-left text-body-medium text-text-action outline-none transition-colors hover:bg-background-action-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2 active:bg-background-action-hover"
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDownSmall className="size-4 shrink-0" />
      </button>
      {open && (
        <Sheet title={label} onClose={close}>
          <SearchInput label={placeholder} value={query} onChange={setQuery} placeholder={placeholder} />
          {visible.length === 0 && <p className="text-text-tertiary">No hay ninguno con ese nombre.</p>}
          {groupItems(visible).map(({ group, items: groupItems }) => (
            <div key={group || "_"} className="flex flex-col gap-2">
              {group && <h3 className="text-caption-1-medium text-text-tertiary">{group}</h3>}
              <ul className={listVariants()}>
                {groupItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-pressed={item.id === value}
                      onClick={() => {
                        onChange(item.id);
                        close();
                      }}
                      className={cx(listRowVariants(), "cursor-pointer text-pretty active:bg-background-interactive-hover")}
                    >
                      <span className={cx("min-w-0 flex-1", item.id === value ? "text-body-medium text-text-action" : "text-body-regular")}>
                        {item.label}
                      </span>
                      {item.id === value && <RiCheckLine className="size-5 shrink-0 text-text-action" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  );
}
