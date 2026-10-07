import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FenInput from './FenInput';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// FenInput is a "controlled" component: it shows the props it is given and
// reports changes through callbacks, but never changes its own value. So the
// tests render it with fake callbacks (vi.fn) and check what they were called with.
function renderFenInput(props = {}) {
  const callbacks = {
    onFenChange: vi.fn(),
    onDepthChange: vi.fn(),
    onMultipvChange: vi.fn(),
    onAnalyze: vi.fn(),
  };
  render(
    <FenInput fen={START_FEN} depth={16} multipv={3} loading={false} {...callbacks} {...props} />
  );
  return callbacks;
}

describe('FenInput', () => {
  it('shows the current FEN, depth and line count', () => {
    renderFenInput();

    expect(screen.getByLabelText('FEN Position')).toHaveValue(START_FEN);
    expect(screen.getByLabelText(/Depth:/)).toHaveValue('16');
    expect(screen.getByLabelText(/Lines:/)).toHaveValue('3');
  });

  it('reports every keystroke in the FEN box', async () => {
    const user = userEvent.setup();
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.type(screen.getByLabelText('FEN Position'), '8/');

    // The input is controlled and fen stays '', so each call carries one character.
    expect(onFenChange).toHaveBeenCalledTimes(2);
    expect(onFenChange).toHaveBeenLastCalledWith('/');
  });

  it('clears the FEN from either clear button', async () => {
    const user = userEvent.setup();
    const { onFenChange } = renderFenInput();

    await user.click(screen.getByRole('button', { name: '✕ Clear' }));
    await user.click(screen.getByRole('button', { name: 'Clear FEN' }));

    expect(onFenChange.mock.calls).toEqual([[''], ['']]);
  });

  it('hides the clear buttons when there is nothing to clear', () => {
    renderFenInput({ fen: '' });

    expect(screen.queryByRole('button', { name: '✕ Clear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear FEN' })).not.toBeInTheDocument();
  });

  it('loads a preset position', async () => {
    const user = userEvent.setup();
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.click(screen.getByRole('button', { name: 'Endgame (Rook + Pawn)' }));

    expect(onFenChange).toHaveBeenCalledWith('8/8/5k2/R7/4P3/8/5K2/8 w - - 0 1');
  });

  it('pastes a trimmed FEN from the clipboard', async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard, so stub it afterwards.
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('  4k3/8/8/8/8/8/8/4K3 w - - 0 1\n');
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onFenChange).toHaveBeenCalledWith('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  });

  it('ignores an empty clipboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('   ');
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onFenChange).not.toHaveBeenCalled();
  });

  it('survives a denied clipboard permission', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new Error('denied'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onFenChange).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('reports slider changes as numbers', () => {
    const { onDepthChange, onMultipvChange } = renderFenInput();

    // user-event cannot drag a range slider; fireEvent sets the value directly.
    fireEvent.change(screen.getByLabelText(/Depth:/), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/Lines:/), { target: { value: '5' } });

    expect(onDepthChange).toHaveBeenCalledWith(20);
    expect(onMultipvChange).toHaveBeenCalledWith(5);
  });

  it('starts the analysis from the submit button', async () => {
    const user = userEvent.setup();
    const { onAnalyze } = renderFenInput();

    await user.click(screen.getByRole('button', { name: /Analyze with Stockfish/ }));

    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('starts the analysis on Enter in the FEN box', async () => {
    const user = userEvent.setup();
    const { onAnalyze } = renderFenInput();

    await user.type(screen.getByLabelText('FEN Position'), '{Enter}');

    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('cannot analyze an empty FEN', () => {
    renderFenInput({ fen: '   ' });

    expect(screen.getByRole('button', { name: /Analyze with Stockfish/ })).toBeDisabled();
  });

  it('does not submit a whitespace-only FEN on Enter', () => {
    const { onAnalyze } = renderFenInput({ fen: '   ' });

    // The button is disabled, but the form can still be submitted directly.
    fireEvent.submit(screen.getByLabelText('FEN Position').closest('form'));

    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('locks every control while an analysis is running', () => {
    renderFenInput({ loading: true });

    expect(screen.getByRole('button', { name: /Analyzing/ })).toBeDisabled();
    expect(screen.getByLabelText('FEN Position')).toBeDisabled();
    expect(screen.getByLabelText(/Depth:/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Starting Position' })).toBeDisabled();
  });
});
