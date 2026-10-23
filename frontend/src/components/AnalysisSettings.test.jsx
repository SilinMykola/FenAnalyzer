import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnalysisSettings from './AnalysisSettings';

function renderSettings(props = {}) {
  const onApply = vi.fn();
  const utils = render(
    <AnalysisSettings depth={20} multipv={3} loading={false} onApply={onApply} {...props} />
  );
  return { ...utils, onApply };
}

// user-event cannot drag a range slider; fireEvent sets the value directly.
const slide = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
const applyButton = () => screen.queryByRole('button', { name: /Apply/ });

describe('AnalysisSettings', () => {
  it('shows the applied depth and line count', () => {
    renderSettings();

    expect(screen.getByLabelText(/Depth:/)).toHaveValue('20');
    expect(screen.getByLabelText(/Lines:/)).toHaveValue('3');
    expect(applyButton()).not.toBeInTheDocument();
  });

  it('puts the default depth of 20 in the middle of the slider, up to 30', () => {
    renderSettings();

    const depth = screen.getByLabelText(/Depth:/);
    expect(depth).toHaveAttribute('min', '10');
    expect(depth).toHaveAttribute('max', '30');
  });

  it('offers Apply once a slider is moved, without applying yet', () => {
    const { onApply } = renderSettings();

    slide(/Depth:/, 24);

    expect(screen.getByLabelText(/Depth:/)).toHaveValue('24');
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(applyButton()).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('hides Apply when the sliders are moved back', () => {
    renderSettings();

    slide(/Depth:/, 24);
    slide(/Depth:/, 20);

    expect(applyButton()).not.toBeInTheDocument();
  });

  it('applies what the sliders show', async () => {
    const user = userEvent.setup();
    const { onApply } = renderSettings();
    slide(/Depth:/, 12);
    slide(/Lines:/, 5);

    await user.click(applyButton());

    expect(onApply).toHaveBeenCalledWith(12, 5);
  });

  it('follows newly applied values', () => {
    const { rerender, onApply } = renderSettings();
    slide(/Depth:/, 12);

    rerender(<AnalysisSettings depth={12} multipv={3} loading={false} onApply={onApply} />);

    expect(screen.getByLabelText(/Depth:/)).toHaveValue('12');
    expect(applyButton()).not.toBeInTheDocument();
  });

  it('locks the sliders while an analysis is running', () => {
    renderSettings({ loading: true });

    expect(screen.getByLabelText(/Depth:/)).toBeDisabled();
    expect(screen.getByLabelText(/Lines:/)).toBeDisabled();
  });
});
