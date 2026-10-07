import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import PgnViewer from './PgnViewer';

// Real move objects, built by chess.js the same way App builds them.
function movesFrom(sans, fen) {
  const game = fen ? new Chess(fen) : new Chess();
  sans.forEach((san) => game.move(san));
  return game.history({ verbose: true });
}

const OPENING = movesFrom(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);

function renderViewer(props = {}) {
  const callbacks = {
    onPgnTextChange: vi.fn(),
    onLoadPgn: vi.fn(),
    onResetGame: vi.fn(),
    onSelectMove: vi.fn(),
    onPrevMove: vi.fn(),
    onNextMove: vi.fn(),
    onFirstMove: vi.fn(),
    onLastMove: vi.fn(),
  };
  const allProps = {
    pgnText: '',
    moves: OPENING,
    currentMoveIndex: OPENING.length - 1,
    headers: {},
    ...callbacks,
    ...props,
  };
  const utils = render(<PgnViewer {...allProps} />);
  const rerender = (changes) => utils.rerender(<PgnViewer {...allProps} {...changes} />);
  return { ...callbacks, rerender };
}

// The rows of the scoresheet as plain text: [['1.', 'e4', 'e5'], ...]
function scoresheet() {
  return within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
}

const navButton = (title) => screen.getByTitle(new RegExp(title));

describe('PgnViewer without a game', () => {
  it('says no game is loaded', () => {
    renderViewer({ moves: [], currentMoveIndex: -1 });

    expect(screen.getByText('No PGN game loaded yet.')).toBeInTheDocument();
    expect(screen.getByText('No game loaded')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('loads the sample game in one click', async () => {
    const user = userEvent.setup();
    const { onPgnTextChange, onLoadPgn } = renderViewer({ moves: [], currentMoveIndex: -1 });

    await user.click(screen.getByRole('button', { name: /Load Sample World Championship Game/ }));

    const sample = onLoadPgn.mock.calls[0][0];
    expect(sample).toMatch(/\[White "Robert James Fischer"\]/);
    expect(onPgnTextChange).toHaveBeenCalledWith(sample);
  });

  it('disables every navigation button', () => {
    renderViewer({ moves: [], currentMoveIndex: -1 });

    for (const title of ['Start of game', 'Previous move', 'Next move', 'End of game']) {
      expect(navButton(title)).toBeDisabled();
    }
  });

  it('offers no "Clear Game" button', () => {
    renderViewer({ moves: [], currentMoveIndex: -1 });

    expect(screen.queryByRole('button', { name: /Clear Game/ })).not.toBeInTheDocument();
  });
});

describe('PgnViewer scoresheet', () => {
  it('pairs White and Black moves by move number', () => {
    renderViewer();

    expect(scoresheet()).toEqual([
      ['1.', 'e4', 'e5'],
      ['2.', 'Nf3', 'Nc6'],
      ['3.', 'Bb5', '—'],
    ]);
  });

  it('starts with an empty White cell when Black moves first', () => {
    // Games from a custom position (Chess.com "SetUp") can start with Black.
    const moves = movesFrom(['Kd7', 'Kd2'], '4k3/8/8/8/8/8/8/4K3 b - - 0 12');
    renderViewer({ moves, currentMoveIndex: 1 });

    expect(scoresheet()).toEqual([
      ['12.', '—', 'Kd7'],
      ['13.', 'Kd2', '—'],
    ]);
  });

  it('highlights the current move and its row', () => {
    renderViewer({ currentMoveIndex: 2 });

    const nf3 = screen.getByRole('button', { name: 'Nf3' });
    expect(nf3).toHaveClass('active');
    expect(nf3.closest('tr')).toHaveClass('row-active');
    expect(screen.getByRole('button', { name: 'e4' })).not.toHaveClass('active');
  });

  it('jumps to a clicked move by its index in the game', async () => {
    const user = userEvent.setup();
    const { onSelectMove } = renderViewer();

    await user.click(screen.getByRole('button', { name: 'Nc6' }));
    await user.click(screen.getByRole('button', { name: 'e4' }));

    expect(onSelectMove.mock.calls).toEqual([[3], [0]]);
  });

  it('scrolls the current move into view when it changes', () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = renderViewer({ currentMoveIndex: 0 });
    scrollIntoView.mockClear();

    rerender({ currentMoveIndex: 3 });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('button', { name: 'Nc6' }).closest('tr'));
  });
});

describe('PgnViewer navigation', () => {
  it('counts moves from 1', () => {
    renderViewer({ currentMoveIndex: 1 });

    expect(screen.getByText(/Move/).textContent).toBe('Move 2 / 5');
  });

  it('shows move 0 at the starting position', () => {
    renderViewer({ currentMoveIndex: -1 });

    expect(screen.getByText(/Move/).textContent).toBe('Move 0 / 5');
  });

  it('wires each button to its callback', async () => {
    const user = userEvent.setup();
    const cb = renderViewer({ currentMoveIndex: 2 });

    await user.click(navButton('Start of game'));
    await user.click(navButton('Previous move'));
    await user.click(navButton('Next move'));
    await user.click(navButton('End of game'));

    expect(cb.onFirstMove).toHaveBeenCalledTimes(1);
    expect(cb.onPrevMove).toHaveBeenCalledTimes(1);
    expect(cb.onNextMove).toHaveBeenCalledTimes(1);
    expect(cb.onLastMove).toHaveBeenCalledTimes(1);
  });

  it('cannot go back from the starting position', () => {
    renderViewer({ currentMoveIndex: -1 });

    expect(navButton('Start of game')).toBeDisabled();
    expect(navButton('Previous move')).toBeDisabled();
    expect(navButton('Next move')).toBeEnabled();
  });

  it('cannot go forward from the last move', () => {
    renderViewer({ currentMoveIndex: OPENING.length - 1 });

    expect(navButton('Next move')).toBeDisabled();
    expect(navButton('End of game')).toBeDisabled();
    expect(navButton('Previous move')).toBeEnabled();
  });
});

describe('PgnViewer game details', () => {
  const headers = {
    White: 'Fischer',
    Black: 'Spassky',
    WhiteElo: '2785',
    BlackElo: '2660',
    Event: 'World Championship',
    Date: '1972.07.??',
    Result: '1-0',
  };

  it('shows players with ratings, the event and the date', () => {
    renderViewer({ headers });

    expect(screen.getByText(/Fischer \(2785\) vs Spassky \(2660\)/)).toBeInTheDocument();
    // The unknown day "??" is dropped from the date.
    expect(screen.getByText('World Championship · 1972.07')).toBeInTheDocument();
  });

  it('shows players without ratings when there are none', () => {
    renderViewer({ headers: { White: 'Alice', Black: 'Bob' } });

    expect(screen.getByText('Alice vs Bob')).toBeInTheDocument();
  });

  it.each([
    ['1-0', '1–0 White wins', 'white-wins'],
    ['0-1', '0–1 Black wins', 'black-wins'],
    ['1/2-1/2', '½–½ Draw', 'draw'],
    ['*', '*', 'draw'],
  ])('spells out the result %s', (result, text, className) => {
    renderViewer({ headers: { Result: result } });

    expect(screen.getByText(text)).toHaveClass(className);
  });

  it('hides the result while no moves are loaded', () => {
    renderViewer({ headers: { Result: '1-0' }, moves: [], currentMoveIndex: -1 });

    expect(screen.queryByText('Result:')).not.toBeInTheDocument();
  });

  it('clears the loaded game', async () => {
    const user = userEvent.setup();
    const { onPgnTextChange, onResetGame } = renderViewer();

    await user.click(screen.getByRole('button', { name: /Clear Game/ }));

    expect(onPgnTextChange).toHaveBeenCalledWith('');
    expect(onResetGame).toHaveBeenCalledTimes(1);
  });
});

describe('PgnViewer import form', () => {
  const openForm = (user) => user.click(screen.getByRole('button', { name: /Import \/ Paste PGN/ }));

  it('is hidden until asked for, and can be hidden again', async () => {
    const user = userEvent.setup();
    renderViewer();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await openForm(user);
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide PGN Input' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('reports typed text', async () => {
    const user = userEvent.setup();
    const { onPgnTextChange } = renderViewer();
    await openForm(user);

    await user.type(screen.getByRole('textbox'), '1');

    expect(onPgnTextChange).toHaveBeenCalledWith('1');
  });

  it('loads the PGN and closes the form', async () => {
    const user = userEvent.setup();
    const { onLoadPgn } = renderViewer({ pgnText: '1. e4 e5' });
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Parse & Load Game' }));

    expect(onLoadPgn).toHaveBeenCalledWith('1. e4 e5');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cannot load empty text', async () => {
    const user = userEvent.setup();
    renderViewer({ pgnText: '  ' });
    await openForm(user);

    expect(screen.getByRole('button', { name: 'Parse & Load Game' })).toBeDisabled();
  });

  it('fills in the Fischer – Spassky game', async () => {
    const user = userEvent.setup();
    const { onPgnTextChange } = renderViewer();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: 'Load Fischer vs Spassky' }));

    expect(onPgnTextChange.mock.calls[0][0]).toMatch(/41\. Qf4 1-0$/);
  });

  it('clears the text from either clear button', async () => {
    const user = userEvent.setup();
    const { onPgnTextChange } = renderViewer({ pgnText: '1. e4' });
    await openForm(user);

    await user.click(screen.getByRole('button', { name: '✕ Clear' }));
    await user.click(screen.getByRole('button', { name: 'Clear Text' }));

    expect(onPgnTextChange.mock.calls).toEqual([[''], ['']]);
  });

  it('pastes the PGN from the clipboard', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue('1. d4 d5');
    const { onPgnTextChange } = renderViewer();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onPgnTextChange).toHaveBeenCalledWith('1. d4 d5');
  });

  it('survives a denied clipboard permission', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'readText').mockRejectedValue(new Error('denied'));
    const { onPgnTextChange } = renderViewer();
    await openForm(user);

    await user.click(screen.getByRole('button', { name: /Paste from Clipboard/ }));

    expect(onPgnTextChange).not.toHaveBeenCalled();
  });
});
