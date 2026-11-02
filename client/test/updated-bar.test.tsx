// The "app was updated" bar: a thin, dismissible bar in the page flow (design.md section 5.5).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdatedBar } from '../src/App';

describe('update bar', () => {
  it('offers a reload and a dismiss button', () => {
    const html = renderToStaticMarkup(<UpdatedBar onDismiss={() => {}} />);
    expect(html).toContain('The app was updated.');
    expect(html).toContain('Tap to reload.</button>');
    expect(html).toContain('aria-label="Dismiss"');
  });
});
