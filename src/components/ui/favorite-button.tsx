
import { Button } from "@/components/ui/button";
type FavoriteButtonProps = {
  active: boolean;
  disabled?: boolean;
  label: string;
  className?: string;
  onClick: () => void;
};

export function FavoriteButton({ active, disabled = false, label, className = "", onClick }: FavoriteButtonProps) {
  return <Button variant="icon" size="sm"
    type="button"
    className={`favorite-button${active ? " is-active" : ""}${className ? ` ${className}` : ""}`}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.3 2.7 5.5 6 .9-4.35 4.24 1.03 5.98L12 17.1l-5.38 2.82 1.03-5.98L3.3 9.7l6-.9L12 3.3Z" /></svg>
  </Button>;
}
