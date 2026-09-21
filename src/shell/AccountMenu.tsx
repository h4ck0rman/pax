import { useEffect, useId, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';

type Props = { name: string; email: string; onSignOut: () => void };

/** First letter of the name, or of the address if there is no name. */
function initial(name: string, email: string): string {
  const source = name.trim() || email.trim();
  return (source[0] ?? '?').toUpperCase();
}

/** The account control in the top right: a bubble that opens onto who is signed
 *  in and the way out. Compact enough to stay put on a phone, where a labelled
 *  sign-out button competed with the section nav for room. */
export default function AccountMenu({ name, email, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);

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

  return (
    <div className="account" ref={wrapper} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        className="account-bubble"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account: ${name || email}`}
        onClick={() => setOpen(value => !value)}
      >
        <span aria-hidden="true">{initial(name, email)}</span>
      </button>

      <div className="account-menu" id={menuId}>
        <p className="account-name">{name || email}</p>
        <p className="account-email">{email}</p>
        <button type="button" className="account-signout" onClick={onSignOut}>
          <LogOut size={15} aria-hidden="true" /> Sign out
        </button>
      </div>
    </div>
  );
}
