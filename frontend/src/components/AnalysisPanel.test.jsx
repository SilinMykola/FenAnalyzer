import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AnalysisPanel from './AnalysisPanel';

// The shape the backend's /api/analyze returns.
function makeAnalysis(overrides = {}) {
  return {
    turn: 'white',
    is_check: false,
    is_checkmate: false,
    is_stalemate: false,
    verbal_verdict: 'Even position (balanced game)',
    material: { white: 39, black: 39, diff: 0 },
    wdl: { win_pct: 12.5, draw_pct: 80.1, loss_pct: 7.4 },
    stats: { depth: 18, nodes: 1234567, nps: 2500000, time_seconds: 0.49 },
    lines: [
      {
        rank: 1,
        move_uci: 'e2e4',
        move_san: 'e4',
        score: '+0.30',
        pv_san: ['e4', 'e5', 'Nf3'],
        explanation: 'Pawn moves to e4',
      },
      {
        rank: 2,
        move_uci: 'd2d4',
        move_san: 'd4',
        score: '+0.25',
        pv_san: ['d4', 'd5'],
        explanation: 'Pawn moves to d4',
      },
    ],
    ...overrides,
  };
}

function renderPanel(props = {}) {
  const callbacks = {
    onAskGrandmaster: vi.fn(),
    onSaveCustomApiKey: vi.fn(),
    onPreviewVariation: vi.fn(),
  };
  render(<AnalysisPanel analysis={makeAnalysis()} loading={false} {...callbacks} {...props} />);
  return callbacks;
}

const askButton = () => screen.getByRole('button', { name: /Ask Grandmaster|Thinking/ });

describe('AnalysisPanel states', () => {
  it('shows a spinner while the engine is thinking', () => {
    renderPanel({ loading: true });

    expect(screen.getByText(/Stockfish is computing/)).toBeInTheDocument();
    expect(screen.queryByText('Evaluation & Tactics')).not.toBeInTheDocument();
  });

  it('invites the user to analyze when there is no result yet', () => {
    renderPanel({ analysis: null });

    expect(screen.getByText('Ready for Engine Evaluation')).toBeInTheDocument();
  });
});

describe('AnalysisPanel evaluation', () => {
  it('shows the verdict, score and best move', () => {
    renderPanel();

    expect(screen.getByText('Even position (balanced game)')).toBeInTheDocument();
    expect(screen.getByText('+0.30', { selector: '.eval-score' })).toBeInTheDocument();
    expect(screen.getByText('e4', { selector: '.best-move-san' })).toBeInTheDocument();
    expect(screen.getByText('(e2e4)')).toBeInTheDocument();
    expect(screen.getByText('⚡ Pawn moves to e4')).toBeInTheDocument();
  });

  it.each([
    ['+1.20', 'positive'],
    ['-0.80', 'negative'],
    ['0.00', 'neutral'],
  ])('colours the score %s as %s', (score, className) => {
    const analysis = makeAnalysis();
    analysis.lines[0].score = score;
    renderPanel({ analysis });

    expect(screen.getByText(score, { selector: '.eval-score' })).toHaveClass(className);
  });

  it('marks a check', () => {
    renderPanel({ analysis: makeAnalysis({ is_check: true }) });

    expect(screen.getByText('Check!')).toBeInTheDocument();
  });

  it('marks a checkmate without also calling it a check', () => {
    renderPanel({ analysis: makeAnalysis({ is_check: true, is_checkmate: true, lines: [] }) });

    expect(screen.getByText('Checkmate')).toBeInTheDocument();
    expect(screen.queryByText('Check!')).not.toBeInTheDocument();
  });

  it('marks a stalemate', () => {
    renderPanel({ analysis: makeAnalysis({ is_stalemate: true, lines: [] }) });

    expect(screen.getByText('Stalemate')).toBeInTheDocument();
  });

  it('shows the win, draw and loss chances as text and bar widths', () => {
    renderPanel();

    expect(screen.getByText('12.5% Win')).toBeInTheDocument();
    expect(screen.getByText('80.1% Draw')).toBeInTheDocument();
    expect(screen.getByText('7.4% Loss')).toBeInTheDocument();
    expect(screen.getByTitle('White win probability: 12.5%')).toHaveStyle({ width: '12.5%' });
    expect(screen.getByTitle('Black win probability: 7.4%')).toHaveStyle({ width: '7.4%' });
  });

  it('leaves out the WDL bar when the engine gives none', () => {
    renderPanel({ analysis: makeAnalysis({ wdl: null }) });

    expect(screen.queryByText(/Stockfish WDL Model/)).not.toBeInTheDocument();
  });

  it('shows equal material without a difference badge', () => {
    renderPanel();

    expect(screen.getByText('White 39 pts')).toBeInTheDocument();
    expect(screen.getByText('Black 39 pts')).toBeInTheDocument();
    expect(screen.queryByText(/White$|Black$/, { selector: '.material-diff-badge' })).toBeNull();
  });

  it("shows White's material lead", () => {
    renderPanel({ analysis: makeAnalysis({ material: { white: 39, black: 36, diff: 3 } }) });

    expect(screen.getByText('+3 White')).toHaveClass('diff-pos');
  });

  it("shows Black's material lead", () => {
    renderPanel({ analysis: makeAnalysis({ material: { white: 30, black: 35, diff: -5 } }) });

    expect(screen.getByText('-5 Black')).toHaveClass('diff-neg');
  });

  it('shows the engine statistics', () => {
    renderPanel();

    expect(screen.getByText('Depth: 18')).toBeInTheDocument();
    expect(screen.getByText(`Nodes: ${(1234567).toLocaleString()}`)).toBeInTheDocument();
    expect(screen.getByText('Speed: 2500 kN/s')).toBeInTheDocument();
    expect(screen.getByText('Time: 0.49s')).toBeInTheDocument();
  });

  it('leaves out statistics the engine did not report', () => {
    renderPanel({ analysis: makeAnalysis({ stats: { depth: 0 } }) });

    expect(screen.getByText('Depth: 0')).toBeInTheDocument();
    expect(screen.queryByText(/Nodes:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Speed:/)).not.toBeInTheDocument();
  });
});

describe('AnalysisPanel engine lines', () => {
  it('lists every line with its moves', () => {
    renderPanel();

    const lines = document.querySelectorAll('.line-item');
    expect(lines).toHaveLength(2);
    expect(within(lines[1]).getByText('#2')).toBeInTheDocument();
    expect(within(lines[1]).getByText('+0.25')).toBeInTheDocument();
    const moves = within(lines[0]).getAllByRole('button').map((b) => b.textContent);
    expect(moves).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('says so when there are no legal moves', () => {
    renderPanel({ analysis: makeAnalysis({ lines: [] }) });

    expect(screen.getByText('No legal moves available from this position.')).toBeInTheDocument();
  });

  it('previews the position after a clicked move', async () => {
    const user = userEvent.setup();
    const { onPreviewVariation } = renderPanel();

    await user.click(screen.getByRole('button', { name: 'Nf3' }));

    expect(onPreviewVariation).toHaveBeenCalledWith(1, ['e4', 'e5', 'Nf3'], 2);
  });

  it('falls back to the first move when a line has no variation', async () => {
    const user = userEvent.setup();
    const analysis = makeAnalysis();
    analysis.lines[1].pv_san = [];
    const { onPreviewVariation } = renderPanel({ analysis });

    const secondLine = document.querySelectorAll('.line-item')[1];
    await user.click(within(secondLine).getByRole('button', { name: 'd4' }));

    expect(onPreviewVariation).toHaveBeenCalledWith(2, ['d4'], 0);
  });

  it('highlights the move being previewed', () => {
    renderPanel({ variationPreview: { lineRank: 1, stepIndex: 1 } });

    const firstLine = document.querySelectorAll('.line-item')[0];
    expect(within(firstLine).getByRole('button', { name: 'e5' })).toHaveClass('active');
    expect(within(firstLine).getByRole('button', { name: 'e4' })).not.toHaveClass('active');
  });
});

describe('AnalysisPanel Grandmaster commentary', () => {
  it('asks for commentary', async () => {
    const user = userEvent.setup();
    const { onAskGrandmaster } = renderPanel();

    await user.click(askButton());

    expect(onAskGrandmaster).toHaveBeenCalledTimes(1);
  });

  it('cannot ask without a best move', () => {
    renderPanel({ analysis: makeAnalysis({ lines: [] }) });

    expect(askButton()).toBeDisabled();
  });

  it('shows progress while the commentary is being written', () => {
    renderPanel({ aiLoading: true, aiCommentary: 'old text' });

    expect(askButton()).toBeDisabled();
    expect(askButton()).toHaveTextContent('Thinking...');
    expect(screen.getByText('Grandmaster is analyzing the board...')).toBeInTheDocument();
    // The previous commentary is hidden until the new one arrives.
    expect(screen.queryByText('"old text"')).not.toBeInTheDocument();
  });

  it('shows the commentary and can refresh it', async () => {
    const user = userEvent.setup();
    const { onAskGrandmaster } = renderPanel({ aiCommentary: 'Seize the centre.' });

    expect(screen.getByText('"Seize the centre."')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Refresh/ }));

    expect(onAskGrandmaster).toHaveBeenCalledTimes(1);
  });

  it('shows an error and offers to enter a key when none is set', async () => {
    const user = userEvent.setup();
    renderPanel({ aiError: 'Gemini API Key is not configured.' });

    expect(screen.getByText('⚠️ Gemini API Key is not configured.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter API Key' }));

    expect(screen.getByLabelText(/Gemini API Key/)).toBeInTheDocument();
  });

  it('does not offer to enter a key when one is already set', () => {
    renderPanel({ aiError: 'Rate limited', customApiKey: 'key' });

    expect(screen.queryByRole('button', { name: 'Enter API Key' })).not.toBeInTheDocument();
  });

  it('saves a trimmed API key and closes the form', async () => {
    const user = userEvent.setup();
    const { onSaveCustomApiKey } = renderPanel();

    await user.click(screen.getByRole('button', { name: /Set API Key/ }));
    await user.type(screen.getByLabelText(/Gemini API Key/), '  my-key  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSaveCustomApiKey).toHaveBeenCalledWith('my-key');
    expect(screen.queryByLabelText(/Gemini API Key/)).not.toBeInTheDocument();
  });

  it('toggles the key form open and closed', async () => {
    const user = userEvent.setup();
    renderPanel();

    const toggle = screen.getByRole('button', { name: /Set API Key/ });
    await user.click(toggle);
    expect(screen.getByLabelText(/Gemini API Key/)).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByLabelText(/Gemini API Key/)).not.toBeInTheDocument();
  });

  it('clears a saved key', async () => {
    const user = userEvent.setup();
    const { onSaveCustomApiKey } = renderPanel({ customApiKey: 'old-key' });

    await user.click(screen.getByRole('button', { name: /API Key Set/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onSaveCustomApiKey).toHaveBeenCalledWith('');
  });

  it('never shows the saved key itself', async () => {
    const user = userEvent.setup();
    renderPanel({ customApiKey: 'secret-key' });

    await user.click(screen.getByRole('button', { name: /API Key Set/ }));

    const input = screen.getByLabelText(/Gemini API Key/);
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('');
  });
});
