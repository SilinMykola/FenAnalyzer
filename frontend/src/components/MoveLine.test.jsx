import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { addMove, startLine } from '../utils/moveLine';
import MoveLine from './MoveLine';

const IMAGE = 'r5k1/1Qp1bppp/1n1qp3/1B1p4/3P2b1/2P1P3/PP1N1PPP/R1B2RK1 b - - 4 19';

// Two moves played from the position in the image, the last one shown.
const twoMoves = (index = 1) => ({
  ...addMove(addMove(startLine(IMAGE), 'Kh8', 'fen-1'), 'h3', 'fen-2'),
  index,
});

function renderLine(line) {
  const onGoTo = vi.fn();
  render(<MoveLine line={line} onGoTo={onGoTo} />);
  return onGoTo;
}

const button = (name) => screen.getByRole('button', { name });

describe('MoveLine', () => {
  it('shows nothing before a move is played', () => {
    renderLine(startLine(IMAGE));

    expect(screen.queryByLabelText('Your moves')).not.toBeInTheDocument();
  });

  it('lists the moves numbered from the loaded position and shows its FEN', () => {
    renderLine(twoMoves());

    expect(button('19… Kh8')).toBeInTheDocument();
    expect(button('20. h3')).toBeInTheDocument();
    expect(screen.getByText(IMAGE)).toBeInTheDocument();
  });

  it('marks the move on the board', () => {
    renderLine(twoMoves(0));

    expect(button('19… Kh8')).toHaveAttribute('aria-current', 'step');
    expect(button('20. h3')).not.toHaveAttribute('aria-current');
  });

  it('marks Start while the loaded position is on the board', () => {
    renderLine(twoMoves(-1));

    expect(button('Start')).toHaveAttribute('aria-current', 'step');
  });

  it('goes to a clicked move, or back to the start', async () => {
    const user = userEvent.setup();
    const onGoTo = renderLine(twoMoves());

    await user.click(button('19… Kh8'));
    await user.click(button('Start'));

    expect(onGoTo.mock.calls).toEqual([[0], [-1]]);
  });

  it('steps with the arrow buttons', async () => {
    const user = userEvent.setup();
    const onGoTo = renderLine(twoMoves(0));

    await user.click(screen.getByTitle('Back to the loaded position'));
    await user.click(screen.getByTitle('Back one move'));
    await user.click(screen.getByTitle('Forward one move'));
    await user.click(screen.getByTitle('To your last move'));

    expect(onGoTo.mock.calls).toEqual([[-1], [-1], [1], [1]]);
  });

  it('cannot step back from the start or forward from the last move', () => {
    const { unmount } = render(<MoveLine line={twoMoves(-1)} onGoTo={vi.fn()} />);
    expect(screen.getByTitle('Back to the loaded position')).toBeDisabled();
    expect(screen.getByTitle('Back one move')).toBeDisabled();
    expect(screen.getByTitle('Forward one move')).toBeEnabled();
    unmount();

    renderLine(twoMoves(1));
    expect(screen.getByTitle('Forward one move')).toBeDisabled();
    expect(screen.getByTitle('To your last move')).toBeDisabled();
    expect(screen.getByTitle('Back one move')).toBeEnabled();
  });
});
