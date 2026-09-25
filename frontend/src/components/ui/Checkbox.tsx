import { Check } from 'lucide-react';
import { ButtonHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Checkbox({
  checked,
  onCheckedChange,
  onClick,
  className,
  disabled = false,
  type = 'button',
  ...props
}: CheckboxProps) {
  return (
    <button
      type={type}
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className={cx(
        'bg-background inline-flex h-[16px] w-[16px] relative -top-px shrink-0 items-center justify-center rounded-[3px] border',
        checked
          ? 'border-transparent bg-primary text-[var(--ide-Button-default-foreground)]'
          : 'border-[var(--ide-Button-startBorderColor)] text-transparent',
        'focus:border-[var(--ide-Button-focusedBorderColor)] focus:outline-none',
        className
      )}
      onClick={(event) => {
        onClick?.(event);
        if (disabled) return;
        onCheckedChange?.(!checked);
      }}
      {...props}
    >
      {checked ? <Check size={11} strokeWidth={3.25} /> : null}
    </button>
  );
}
