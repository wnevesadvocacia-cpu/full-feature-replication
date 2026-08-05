import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { ptBR } from 'date-fns/locale';


function isoToBr(iso?: string) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function brToIso(br: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return '';
  const [, d, mo, y] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return '';
  return `${y}-${mo}-${d}`;
}

function mask(v: string) {
  const digits = v.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type Props = Omit<React.ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  /** ISO date (yyyy-mm-dd) */
  value?: string;
  /** receives ISO date (yyyy-mm-dd) or '' */
  onChange?: (iso: string) => void;
};

/** Campo de data no padrão brasileiro (dd/mm/aaaa), mantendo valor ISO no estado. */
export function DateInputBR({ value, onChange, className, ...rest }: Props) {
  const [text, setText] = useState(isoToBr(value));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setText(isoToBr(value));
  }, [value]);

  const selected = value && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T12:00:00`) : undefined;

  return (
    <div className="relative">
      <Input
        {...rest}
        className={`pr-9 ${className ?? ''}`}
        type="text"
        inputMode="numeric"
        placeholder={rest.placeholder ?? 'dd/mm/aaaa'}
        value={text}
        onChange={(e) => {
          const masked = mask(e.target.value);
          setText(masked);
          const iso = brToIso(masked);
          if (iso || masked === '') onChange?.(iso);
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Abrir calendário"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-50" align="end">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (!d) return;
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              setText(isoToBr(iso));
              onChange?.(iso);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );

}
