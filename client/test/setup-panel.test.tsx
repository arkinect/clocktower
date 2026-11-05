// The Setup panel's Godfather choice.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GodfatherChoice } from '../src/admin/Setup';

const html = (chosen: 1 | -1 | null, outsidersBefore: number) => renderToStaticMarkup(<GodfatherChoice chosen={chosen} outsidersBefore={outsidersBefore} />);
const MINUS_OFF = '<button class="" disabled="">−1 Outsider</button>';

describe('Godfather choice', () => {
  it('a -1 chosen before there was no Outsider left to remove shows as +1', () => {
    const out = html(-1, 0);
    expect(out).toContain(MINUS_OFF);
    expect(out).toContain('<button class="on">+1 Outsider</button>');
    expect(html(-1, -1)).toContain('<button class="on">+1 Outsider</button>');
  });

  it('a -1 that is still possible stays selected', () => {
    const out = html(-1, 1);
    expect(out).toContain('<button class="on">−1 Outsider</button>');
    expect(out).toContain('<button class="">+1 Outsider</button>');
  });

  it('nothing chosen selects nothing', () => {
    const out = html(null, 0);
    expect(out).toContain(MINUS_OFF);
    expect(out).toContain('<button class="">+1 Outsider</button>');
  });
});
