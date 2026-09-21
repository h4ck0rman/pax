import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

export type SectionOption<Id extends string> = { id: Id; label: string; icon: LucideIcon };

type Props<Id extends string> = {
  sections: readonly SectionOption<Id>[];
  current: Id;
  onChoose: (id: Id) => void;
};

/** Section navigation that keeps working as sections are added.
 *
 *  On a wide screen it is a row of items. On a narrow one the row collapses into
 *  a single control naming the current section, which opens the full list. That
 *  way a fourth or fifth section costs no horizontal room, which the old row of
 *  pills could not survive. */
export default function AppNav<Id extends string>({
  sections,
  current,
  onChoose,
}: Props<Id>) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

  // Close on Escape, and on a click outside, as a menu is expected to.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  const active = sections.find(section => section.id === current) ?? sections[0];
  const ActiveIcon = active.icon;

  return (
    <div className="app-sections" ref={wrapper} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="sections-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(value => !value)}
      >
        <ActiveIcon size={16} aria-hidden="true" />
        <span className="sections-toggle-label">{active.label}</span>
        <ChevronDown size={15} aria-hidden="true" className="sections-caret" />
      </button>

      <nav className="sections-menu" id={menuId} aria-label="Sections">
        <ul className="sections-list">
          {sections.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className="section-item"
                aria-current={id === current ? 'page' : undefined}
                onClick={() => {
                  onChoose(id);
                  setOpen(false);
                }}
              >
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
