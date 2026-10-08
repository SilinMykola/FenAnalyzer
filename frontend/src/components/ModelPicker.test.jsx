import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ModelPicker from './ModelPicker';

const MODELS = ['gemini-2.5-flash-lite', 'gemini-3.8-flash'];

function renderPicker(props = {}) {
  const onChange = vi.fn();
  render(
    <ModelPicker value="" models={MODELS} defaultModel="gemini-3.8-flash" onChange={onChange} {...props} />
  );
  return { onChange, select: screen.getByLabelText(props.ariaLabel || 'Gemini model') };
}

const optionTexts = (select) => within(select).getAllByRole('option').map((o) => o.textContent);

describe('ModelPicker', () => {
  it('lists the server default first, then the models', () => {
    const { select } = renderPicker();

    expect(optionTexts(select)).toEqual([
      'Default (gemini-3.8-flash)',
      'gemini-2.5-flash-lite',
      'gemini-3.8-flash',
    ]);
    expect(select).toHaveValue('');
  });

  it('names the default plainly before the server has said which it is', () => {
    const { select } = renderPicker({ defaultModel: null, models: [] });

    expect(optionTexts(select)).toEqual(['Default model']);
  });

  it('keeps a chosen model listed even when the list does not have it', () => {
    const { select } = renderPicker({ value: 'gemini-2.5-pro' });

    expect(select).toHaveValue('gemini-2.5-pro');
    expect(optionTexts(select)).toContain('gemini-2.5-pro');
  });

  it('reports the chosen model, or "" for the default', async () => {
    const user = userEvent.setup();
    const { select, onChange } = renderPicker({ value: 'gemini-3.8-flash' });

    await user.selectOptions(select, 'gemini-2.5-flash-lite');
    await user.selectOptions(select, '');

    expect(onChange.mock.calls).toEqual([['gemini-2.5-flash-lite'], ['']]);
  });

  it('can go without its label and carry its own accessible name', () => {
    renderPicker({ label: '', ariaLabel: 'Switch Gemini model for reading images' });

    expect(screen.queryByText('🤖 Gemini')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Switch Gemini model for reading images')).toBeInTheDocument();
  });
});
