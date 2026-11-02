// The role list's Jinxes section (players' Roles tab and the Storyteller's reference).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoleList } from '../src/common';

const html = (enabled: string[]) => renderToStaticMarkup(<RoleList enabled={enabled} />);

describe('role list jinxes', () => {
  it('lists each jinx whose two roles are both on the script, labelled', () => {
    const out = html(['marionette', 'huntsman', 'balloonist', 'imp', 'damsel']);
    expect(out).toContain('<h3>Jinxes</h3>');
    expect(out).toContain('Jinx (Marionette &amp; Balloonist):');
    expect(out).toContain('Jinx (Marionette &amp; Huntsman):</b> If the Marionette thinks that they are the Huntsman, the Damsel was added during setup.');
    expect(out).not.toContain('Lil');
  });

  it('has no Jinxes section when no jinxed pair is on the script', () => {
    expect(html(['marionette', 'imp', 'empath'])).not.toContain('Jinxes');
  });
});
