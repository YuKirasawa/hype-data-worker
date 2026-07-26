export const fmt = {
  num:    (n: number) => n.toLocaleString('en-US'),
  dollar: (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  price:  (n: number) => '$' + n.toFixed(4),
  signed: (n: number) => (n >= 0 ? '+' : '') + n.toLocaleString('en-US'),
  hyped:  (n: number) => n.toLocaleString('en-US') + ' HYPE',
}

type Section =
  | { kind: 'header'; text: string }
  | { kind: 'line';   label: string; value: string }
  | { kind: 'sep' }

export function buildMessage(sections: Section[]): string {
  return sections.map(s => {
    switch (s.kind) {
      case 'header': return s.text;
      case 'sep':    return '';
      case 'line':   return `${s.label}: ${s.value}`;
    }
  }).join('\n');
}

export interface Stats {
  currentBalance: number
  buybackHype: number
  buybackUsd: number
  hypePrice: number
  USDCSupply: number
  USDCDailyInterest: number
  USDCBalanceDiff: number
  revenue: number
  hypeSupply: number
  pe: number
}

export function buybackReport(d: Stats): string {
  return buildMessage([
    { kind: 'header', text: '📊 AF Buyback Report' },
    { kind: 'line', label: 'Balance',       value: fmt.hyped(d.currentBalance) },
    { kind: 'line', label: 'Buyback (24h)', value: `${fmt.hyped(d.buybackHype)} (${fmt.dollar(d.buybackUsd)})` },
    { kind: 'line', label: 'HYPE Price',    value: fmt.price(d.hypePrice) },
    { kind: 'line', label: 'USDC Supply',   value: fmt.num(d.USDCSupply) },
    { kind: 'line', label: 'USDC Δ Balance',value: fmt.signed(d.USDCBalanceDiff) },
    { kind: 'line', label: 'Revenue',       value: fmt.dollar(d.revenue) },
    { kind: 'line', label: 'PE',            value: d.pe.toFixed(2) },
  ])
}
