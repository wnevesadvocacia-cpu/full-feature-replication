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
export function DateInputBR({ value, onChange, ...rest }: Props) {
  const [text, setText] = useState(isoToBr(value));

  useEffect(() => {
    setText(isoToBr(value));
  }, [value]);

  return (
    <Input
      {...rest}
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
  );
}
