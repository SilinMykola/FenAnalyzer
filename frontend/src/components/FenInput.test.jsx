import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import FenInput from './FenInput';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// FenInput is a "controlled" component: it shows the props it is given and
// reports changes through callbacks, but never changes its own value. So the
// tests render it with fake callbacks (vi.fn) and check what they were called with.
function renderFenInput(props = {}) {
  const callbacks = {
    onFenChange: vi.fn(),
    onPgn: vi.fn(),
    onAnalyze: vi.fn(),
  };
  render(
    <FenInput fen={START_FEN} loading={false} {...callbacks} {...props} />
  );
  return callbacks;
}

describe('FenInput', () => {
  it('shows the current FEN', () => {
    renderFenInput();

    expect(screen.getByLabelText('FEN Position or PGN')).toHaveValue(START_FEN);
  });

  it('reports every keystroke in the FEN box', async () => {
    const user = userEvent.setup();
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.type(screen.getByLabelText('FEN Position or PGN'), '8/');

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

  it('hands a game from the clipboard on as a PGN', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('[Event "Casual"]\n\n1. e4 e5 *\n');
    const { onFenChange, onPgn } = renderFenInput({ fen: '' });

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onPgn).toHaveBeenCalledWith('[Event "Casual"]\n\n1. e4 e5 *');
    expect(onFenChange).not.toHaveBeenCalled();
  });

  it('hands a game pasted into the field on as a PGN, and keeps a FEN in the field', () => {
    const { onPgn } = renderFenInput({ fen: '' });
    const field = screen.getByLabelText('FEN Position or PGN');
    const paste = (text) => fireEvent.paste(field, { clipboardData: { getData: () => text } });

    paste('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(onPgn).not.toHaveBeenCalled();

    paste('1. e4 e5 2. Nf3 *');
    expect(onPgn).toHaveBeenCalledWith('1. e4 e5 2. Nf3 *');
  });

  it('ignores an empty clipboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('   ');
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onFenChange).not.toHaveBeenCalled();
  });

  it('points to ⌘V / Ctrl+V when the browser denies the clipboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new Error('denied'));
    const { onFenChange } = renderFenInput({ fen: '' });

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onFenChange).not.toHaveBeenCalled();
    expect(screen.getByText(/did not let the page read the clipboard/)).toHaveTextContent(
      '⌘V / Ctrl+V'
    );
  });

  it('forgets the clipboard hint after a paste on the page', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new Error('denied'));
    renderFenInput({ fen: '' });
    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    fireEvent.paste(window, { clipboardData: { files: [], getData: () => '1. e4' } });

    expect(screen.queryByText(/did not let the page read the clipboard/)).not.toBeInTheDocument();
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

    await user.type(screen.getByLabelText('FEN Position or PGN'), '{Enter}');

    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('cannot analyze an empty FEN', () => {
    renderFenInput({ fen: '   ' });

    expect(screen.getByRole('button', { name: /Analyze with Stockfish/ })).toBeDisabled();
  });

  it('does not submit a whitespace-only FEN on Enter', () => {
    const { onAnalyze } = renderFenInput({ fen: '   ' });

    // The button is disabled, but the form can still be submitted directly.
    fireEvent.submit(screen.getByLabelText('FEN Position or PGN').closest('form'));

    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('locks every control while an analysis is running', () => {
    renderFenInput({ loading: true });

    expect(screen.getByRole('button', { name: /Analyzing/ })).toBeDisabled();
    expect(screen.getByLabelText('FEN Position or PGN')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Starting Position' })).toBeDisabled();
  });

  it('speaks Russian inside a Russian provider', () => {
    render(
      <I18nProvider initialLanguage="ru">
        <FenInput fen={START_FEN} loading={false} onFenChange={vi.fn()} onAnalyze={vi.fn()} />
      </I18nProvider>
    );

    expect(screen.getByLabelText('Позиция FEN или PGN')).toHaveAttribute(
      'placeholder',
      'Вставьте FEN или PGN сюда (например, rnbqkbnr/pppppppp/...)'
    );
    expect(screen.getByRole('button', { name: 'Бессмертная Каспарова (1999)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Эндшпиль (ладья + пешка)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '⚡ Анализировать в Stockfish' })).toBeEnabled();
  });
});
