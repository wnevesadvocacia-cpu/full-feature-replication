import { render, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { DateInputBR } from '@/components/DateInputBR';

function Host({ initial }: { initial: string }) {
  const [v, setV] = useState(initial);
  return (<><DateInputBR value={v} onChange={setV} /><span data-testid="iso">{v}</span></>);
}

describe('DateInputBR', () => {
  it('substitui a data anterior ao digitar ano de 2 dígitos', () => {
    render(<Host initial="2026-10-16" />);
    const input = screen.getByPlaceholderText('dd/mm/aaaa') as HTMLInputElement;
    expect(input.value).toBe('16/10/2026');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('iso').textContent).toBe('');
    fireEvent.change(input, { target: { value: '22/11/26' } });
    expect(screen.getByTestId('iso').textContent).toBe('2026-11-22');
    fireEvent.blur(input);
    expect(input.value).toBe('22/11/2026');
    expect(screen.getByTestId('iso').textContent).toBe('2026-11-22');
  });
  it('ano de 4 dígitos e data inválida', () => {
    render(<Host initial="2026-10-16" />);
    const input = screen.getAllByPlaceholderText('dd/mm/aaaa')[0] as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '31/02/2026' } });
    expect(screen.getByTestId('iso').textContent).toBe('');
    fireEvent.change(input, { target: { value: '05/12/2026' } });
    expect(screen.getByTestId('iso').textContent).toBe('2026-12-05');
  });
});
