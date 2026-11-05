// The action form's 'option' fields (a fixed set of answers, e.g. Live / Die) render as buttons.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ActionField, ActionSpec } from '@ct/shared';
import { ActionPicker } from '../src/common';

const spec = (field: ActionField): ActionSpec =>
  ({ key: 'q', roleId: 'empath', title: 'Question', prompt: 'Choose.', fields: [field], distinct: false, allowDecline: false });
const render = (field: ActionField, values: string[] = []) =>
  renderToStaticMarkup(<ActionPicker specs={[spec(field)]} names={{ p1: 'Ada' }} value={{ q: { values } }} onChange={() => {}} />);

describe('action picker', () => {
  it('shows an option field as a button per answer, with its label, and marks the chosen one', () => {
    const html = render({ kind: 'option', label: 'Answer', options: ['live', 'die'], labels: { live: 'Live', die: 'Die' } }, ['die']);
    expect(html).not.toContain('<select');
    expect(html).toContain('<button type="button" class="" aria-pressed="false">Live</button>');
    expect(html).toContain('<button type="button" class="on" aria-pressed="true">Die</button>');
  });

  it('shows the option ids when the server sends no labels', () => {
    const html = render({ kind: 'option', label: 'Answer', options: ['live', 'die'] });
    expect(html).toContain('>live</button>');
    expect(html).toContain('>die</button>');
  });

  it('still shows players and roles in a dropdown, and a kind it doesn\'t know as a dropdown of ids', () => {
    expect(render({ kind: 'player', label: 'Player', options: ['p1'] })).toContain('<option value="p1">Ada</option>');
    expect(render({ kind: 'role', label: 'Character', options: ['empath'] })).toContain('<option value="empath">Empath</option>');
    const unknown = { kind: 'colour', label: 'Colour', options: ['red'] } as unknown as ActionField;
    expect(render(unknown)).toContain('<option value="red">red</option>');
  });
});
