// The markup that keeps controls from resizing when their label changes. Layout itself needs a browser.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RoleCard } from '@ct/shared';
import { RoleCardView, StableLabel, TimedButton } from '../src/common';

const hidden = (text: string) => `aria-hidden="true">${text}</span>`;

describe('StableLabel', () => {
  it('contains every label, and only the current one lacks aria-hidden', () => {
    const html = renderToStaticMarkup(<StableLabel labels={['One', 'Two', 'Three']} current={1} />);
    expect(html).toContain(hidden('One'));
    expect(html).toContain('<span>Two</span>');
    expect(html).toContain(hidden('Three'));
    expect(html.match(/aria-hidden/g)).toHaveLength(2);
  });
});

describe('TimedButton', () => {
  it('unarmed, shows its label and keeps a hidden "Cancel" for the width', () => {
    const html = renderToStaticMarkup(<TimedButton onConfirm={() => {}}>Remove</TimedButton>);
    expect(html).toContain('<span>Remove</span>');
    expect(html).toContain(hidden('Cancel'));
  });
});

describe('RoleCardView', () => {
  const role: RoleCard = { roleId: 'empath', name: 'Empath', type: 'townsfolk', abilityText: 'Each night, you learn something.' };

  it('hidden, the role sits in an aria-hidden face and the reveal prompt is visible', () => {
    const html = renderToStaticMarkup(<RoleCardView role={role} />);
    expect(html).toMatch(/<div class="rolecard-face stable-off" aria-hidden="true">.*Empath.*Tap to hide<\/div><\/div><div class="rolecard-face">.*Tap to reveal your role/);
  });

  it('revealed, the prompt is the hidden face', () => {
    const html = renderToStaticMarkup(<RoleCardView role={role} hiddenByDefault={false} />);
    expect(html).toMatch(/<div class="rolecard-face">.*Empath.*<div class="rolecard-face stable-off" aria-hidden="true">.*Tap to reveal your role/);
  });
});
