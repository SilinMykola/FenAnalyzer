import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { analyzeFen, checkBackendHealth, getAiCommentary, recognizeImage } from './api/chessApi';
import { chessboardProps } from './test/mockChessboard';

// App is tested together with its real child components. Only the edges are
// replaced: the backend (chessApi), the drag-and-drop board and the sound.
vi.mock('./api/chessApi');
vi.mock('react-chessboard', () => import('./test/mockChessboard'));
vi.mock('./utils/sound');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_E4_E5_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

const ANALYSIS = {
  fen: START_FEN,
  turn: 'white',
  is_check: false,
  is_checkmate: false,
  is_stalemate: false,
  verbal_verdict: 'Even position (balanced game)',
  material: { white: 39, black: 39, diff: 0 },
  wdl: null,
  stats: { depth: 16 },
  lines: [
    {
      rank: 1,
      move_uci: 'e2e4',
      move_san: 'e4',
      score: '+0.30',
      pv_san: ['e4', 'e5', 'Nf3'],
      pv_uci: ['e2e4', 'e7e5', 'g1f3'],
      explanation: 'Pawn moves to e4',
    },
  ],
};

const PGN = `[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 1-0`;

// Every FEN the backend has been asked to analyze, in order.
const analyzedFens = () => analyzeFen.mock.calls.map(([fen]) => fen);
const lastAnalyzedFen = () => analyzedFens().at(-1);

async function renderApp() {
  render(<App />);
  // Let the mount-time health check and first analysis settle.
  await screen.findByText('Even position (balanced game)');
}

beforeEach(() => {
  vi.mocked(checkBackendHealth).mockResolvedValue({ ok: true });
  vi.mocked(analyzeFen).mockResolvedValue(ANALYSIS);
  vi.mocked(getAiCommentary).mockResolvedValue({ success: true, commentary: 'Take the centre.' });
});

describe('App start-up', () => {
  it('analyzes the starting position with depth 16 and 3 lines', async () => {
    await renderApp();

    expect(analyzeFen).toHaveBeenCalledWith(START_FEN, 16, 3);
    expect(chessboardProps().position).toBe(START_FEN);
  });

  it('reports a running backend', async () => {
    await renderApp();

    expect(screen.getByText('Stockfish Ready')).toBeInTheDocument();
  });

  it('reports an unreachable backend', async () => {
    vi.mocked(checkBackendHealth).mockResolvedValue({ ok: false });
    vi.mocked(analyzeFen).mockRejectedValue(new Error('Failed to fetch'));
    render(<App />);

    expect(await screen.findByText('Backend Offline')).toBeInTheDocument();
  });

  it('shows an analysis error in a banner that can be closed', async () => {
    const user = userEvent.setup();
    vi.mocked(analyzeFen).mockRejectedValue(new Error('Stockfish binary not found'));
    render(<App />);

    expect(await screen.findByText('Stockfish binary not found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '✕' }));

    expect(screen.queryByText('Stockfish binary not found')).not.toBeInTheDocument();
  });
});

describe('App playing moves', () => {
  it('plays a legal dragged move and analyzes the new position', async () => {
    await renderApp();

    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('e2', 'e4', 'wP');
    });

    expect(accepted).toBe(true);
    expect(chessboardProps().position).toBe(AFTER_E4);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(AFTER_E4));
  });

  it('rejects an illegal dragged move', async () => {
    await renderApp();
    const callsBefore = analyzeFen.mock.calls.length;

    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('e2', 'e5', 'wP');
    });

    expect(accepted).toBe(false);
    expect(chessboardProps().position).toBe(START_FEN);
    expect(analyzeFen).toHaveBeenCalledTimes(callsBefore);
  });

  it("plays the engine's best move", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /Play Best Move \(e2e4\)/ }));

    expect(chessboardProps().position).toBe(AFTER_E4);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(AFTER_E4));
  });

  it('shows the best move as an arrow', async () => {
    await renderApp();

    expect(chessboardProps().customArrows).toEqual([['e2', 'e4', expect.any(String)]]);
  });

  it('resets everything to the starting position', async () => {
    const user = userEvent.setup();
    await renderApp();
    act(() => {
      chessboardProps().onPieceDrop('e2', 'e4', 'wP');
    });

    await user.click(screen.getByRole('button', { name: /Reset Board/ }));

    expect(chessboardProps().position).toBe(START_FEN);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(START_FEN));
  });
});

describe('App FEN tab', () => {
  it('analyzes a preset position on demand', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Endgame (Rook + Pawn)' }));
    await user.click(screen.getByRole('button', { name: /Analyze with Stockfish/ }));

    expect(chessboardProps().position).toBe('8/8/5k2/R7/4P3/8/5K2/8 w - - 0 1');
    expect(lastAnalyzedFen()).toBe('8/8/5k2/R7/4P3/8/5K2/8 w - - 0 1');
  });

  it('clears the FEN box on reset while the board goes back to the start', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Endgame (Rook + Pawn)' }));
    await user.click(screen.getByRole('button', { name: /Analyze with Stockfish/ }));

    await user.click(screen.getByRole('button', { name: /Reset Board/ }));

    expect(screen.getByLabelText('FEN Position')).toHaveValue('');
    expect(chessboardProps().position).toBe(START_FEN);
    // Nothing to analyze until a new FEN is entered.
    expect(screen.getByRole('button', { name: /Analyze with Stockfish/ })).toBeDisabled();
    await waitFor(() => expect(lastAnalyzedFen()).toBe(START_FEN));
  });

  it('analyzes a FEN typed in after a reset', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: /Reset Board/ }));

    const fen = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    await user.type(screen.getByLabelText('FEN Position'), fen);
    await user.click(screen.getByRole('button', { name: /Analyze with Stockfish/ }));

    expect(chessboardProps().position).toBe(fen);
    expect(lastAnalyzedFen()).toBe(fen);
  });

  it('fills the FEN box again when a move is played after a reset', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: /Reset Board/ }));

    act(() => {
      chessboardProps().onPieceDrop('e2', 'e4', 'wP');
    });

    expect(screen.getByLabelText('FEN Position')).toHaveValue(AFTER_E4);
  });

  it('analyzes with the depth chosen on the slider', async () => {
    await renderApp();

    fireEvent.change(screen.getByLabelText(/Depth:/), { target: { value: '20' } });

    await waitFor(() => expect(analyzeFen.mock.calls.at(-1)[1]).toBe(20));
  });

  // Known bug: triggerAnalysis is recreated when depth changes, and the
  // mount-time effect that depends on it re-runs with the hard-coded starting
  // FEN. So moving a slider analyzes the starting position, not the board.
  // it.fails passes while the bug exists; once it is fixed, swap it for it.
  it.fails('keeps analyzing the current position when the depth changes', async () => {
    await renderApp();
    act(() => {
      chessboardProps().onPieceDrop('e2', 'e4', 'wP');
    });
    await waitFor(() => expect(lastAnalyzedFen()).toBe(AFTER_E4));

    fireEvent.change(screen.getByLabelText(/Depth:/), { target: { value: '20' } });

    await waitFor(() => expect(analyzeFen.mock.calls.at(-1)[1]).toBe(20));
    expect(lastAnalyzedFen()).toBe(AFTER_E4);
  });
});

describe('App PGN tab', () => {
  async function loadPgn(user, pgn = PGN) {
    await user.click(screen.getByRole('button', { name: 'PGN Game Explorer' }));
    await user.click(screen.getByRole('button', { name: /Import \/ Paste PGN/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: pgn } });
    await user.click(screen.getByRole('button', { name: 'Parse & Load Game' }));
  }

  it('loads a game and jumps to its final position', async () => {
    const user = userEvent.setup();
    await renderApp();

    await loadPgn(user);

    expect(screen.getByText('Alice vs Bob')).toBeInTheDocument();
    expect(document.querySelector('.pgn-counter')).toHaveTextContent('Move 3 / 3');
    expect(chessboardProps().position).toBe(AFTER_E4_E5_NF3);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(AFTER_E4_E5_NF3));
  });

  it('reports a PGN it cannot parse', async () => {
    const user = userEvent.setup();
    await renderApp();

    await loadPgn(user, '1. e4 e5 2. Ke3');

    expect(screen.getByText(/Failed to parse PGN/)).toBeInTheDocument();
  });

  it('steps through the game with the buttons', async () => {
    const user = userEvent.setup();
    await renderApp();
    await loadPgn(user);

    await user.click(screen.getByTitle(/Previous move/));
    expect(chessboardProps().position).toBe(AFTER_E4_E5);

    await user.click(screen.getByTitle(/Start of game/));
    expect(chessboardProps().position).toBe(START_FEN);

    await user.click(screen.getByTitle(/Next move/));
    expect(chessboardProps().position).toBe(AFTER_E4);

    await user.click(screen.getByTitle(/End of game/));
    expect(chessboardProps().position).toBe(AFTER_E4_E5_NF3);
  });

  it('jumps to a clicked move', async () => {
    const user = userEvent.setup();
    await renderApp();
    await loadPgn(user);

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: 'e4' }));

    expect(chessboardProps().position).toBe(AFTER_E4);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(AFTER_E4));
  });

  it('steps through the game with the arrow keys', async () => {
    const user = userEvent.setup();
    await renderApp();
    await loadPgn(user);

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(chessboardProps().position).toBe(AFTER_E4);

    await user.keyboard('{ArrowRight}');
    expect(chessboardProps().position).toBe(AFTER_E4_E5);
  });

  it('ignores arrow keys while typing in a text field', async () => {
    const user = userEvent.setup();
    await renderApp();
    await loadPgn(user);
    await user.click(screen.getByRole('button', { name: /Import \/ Paste PGN/ }));

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowLeft' });

    expect(chessboardProps().position).toBe(AFTER_E4_E5_NF3);
  });

  it('ignores arrow keys on the FEN tab', async () => {
    const user = userEvent.setup();
    await renderApp();
    await loadPgn(user);
    await user.click(screen.getByRole('button', { name: 'FEN Analyzer' }));

    await user.keyboard('{ArrowLeft}');

    expect(chessboardProps().position).toBe(AFTER_E4_E5_NF3);
  });

  it('clears the game', async () => {
    const user = userEvent.setup();
    await renderApp();
    await loadPgn(user);

    await user.click(screen.getByRole('button', { name: /Clear Game/ }));

    expect(screen.getByText('No PGN game loaded yet.')).toBeInTheDocument();
    expect(chessboardProps().position).toBe(START_FEN);
  });
});

describe('App board editor tab', () => {
  it('opens on the current position and sends the result back for analysis', async () => {
    const user = userEvent.setup();
    await renderApp();
    act(() => {
      chessboardProps().onPieceDrop('e2', 'e4', 'wP');
    });

    await user.click(screen.getByRole('button', { name: /Board Editor/ }));
    expect(screen.getByRole('textbox')).toHaveValue(AFTER_E4);

    // Black to move with the white pawn back on e2 gives a different position.
    act(() => {
      chessboardProps().onPieceDrop('e4', 'e2', 'wP');
    });
    await user.click(screen.getByRole('button', { name: /Analyze this Setup/ }));

    // Back on the FEN tab, with the edited position on the board.
    const editedFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
    expect(screen.getByLabelText('FEN Position')).toHaveValue(editedFen);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(editedFen));
  });
});

describe('App engine line preview', () => {
  async function previewMove(user, san) {
    const line = document.querySelector('.line-item');
    await user.click(within(line).getByRole('button', { name: san }));
  }

  it('shows the position after a clicked engine move', async () => {
    const user = userEvent.setup();
    await renderApp();

    await previewMove(user, 'e5');

    expect(screen.getByText('Line #1')).toBeInTheDocument();
    expect(screen.getByText(/Move 2\/3/)).toBeInTheDocument();
    expect(chessboardProps().position).toBe(AFTER_E4_E5);
    // While previewing, the board is read-only and shows no best-move arrow.
    expect(chessboardProps().arePiecesDraggable).toBe(false);
    expect(chessboardProps().customArrows).toEqual([]);
  });

  it('steps forward and back through the line', async () => {
    const user = userEvent.setup();
    await renderApp();
    await previewMove(user, 'e4');

    await user.click(screen.getByRole('button', { name: /Next ▶/ }));
    await user.click(screen.getByRole('button', { name: /Next ▶/ }));
    expect(chessboardProps().position).toBe(AFTER_E4_E5_NF3);
    expect(screen.getByRole('button', { name: /Next ▶/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /◀ Prev/ }));
    expect(chessboardProps().position).toBe(AFTER_E4_E5);
  });

  it('leaves the preview when stepping back past the first move', async () => {
    const user = userEvent.setup();
    await renderApp();
    await previewMove(user, 'e4');

    await user.click(screen.getByRole('button', { name: /◀ Prev/ }));

    expect(screen.queryByText('Line #1')).not.toBeInTheDocument();
    expect(chessboardProps().position).toBe(START_FEN);
  });

  it('returns to the real position on exit', async () => {
    const user = userEvent.setup();
    await renderApp();
    await previewMove(user, 'Nf3');

    await user.click(screen.getByRole('button', { name: /Exit/ }));

    expect(chessboardProps().position).toBe(START_FEN);
    expect(chessboardProps().arePiecesDraggable).toBe(true);
  });

  it('continues the game from the previewed position', async () => {
    const user = userEvent.setup();
    await renderApp();
    await previewMove(user, 'e5');

    await user.click(screen.getByRole('button', { name: /Play from here/ }));

    expect(screen.queryByText('Line #1')).not.toBeInTheDocument();
    expect(chessboardProps().position).toBe(AFTER_E4_E5);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(AFTER_E4_E5));
  });
});

describe('App Grandmaster commentary', () => {
  it('asks Gemini about the best move and shows the answer', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /Ask Grandmaster/ }));

    expect(await screen.findByText('"Take the centre."')).toBeInTheDocument();
    expect(getAiCommentary).toHaveBeenCalledWith({
      fen: START_FEN,
      turn: 'white',
      score: '+0.30',
      best_move_san: 'e4',
      explanation: 'Pawn moves to e4',
      verbal_verdict: 'Even position (balanced game)',
      custom_api_key: '',
    });
  });

  it("shows the backend's error when Gemini declines", async () => {
    const user = userEvent.setup();
    vi.mocked(getAiCommentary).mockResolvedValue({ success: false, error: 'Key is not configured' });
    await renderApp();

    await user.click(screen.getByRole('button', { name: /Ask Grandmaster/ }));

    expect(await screen.findByText('⚠️ Key is not configured')).toBeInTheDocument();
  });

  it('shows a network error', async () => {
    const user = userEvent.setup();
    vi.mocked(getAiCommentary).mockRejectedValue(new Error('Server error: 500'));
    await renderApp();

    await user.click(screen.getByRole('button', { name: /Ask Grandmaster/ }));

    expect(await screen.findByText('⚠️ Server error: 500')).toBeInTheDocument();
  });

  it('remembers an API key in the browser and sends it along', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /Set API Key/ }));
    await user.type(screen.getByLabelText(/Gemini API Key/), 'my-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: /Ask Grandmaster/ }));

    expect(localStorage.getItem('gemini_api_key')).toBe('my-key');
    expect(getAiCommentary).toHaveBeenCalledWith(
      expect.objectContaining({ custom_api_key: 'my-key' })
    );
  });

  it('starts with a key saved on a previous visit', async () => {
    localStorage.setItem('gemini_api_key', 'saved-key');
    await renderApp();

    expect(screen.getByRole('button', { name: /API Key Set/ })).toBeInTheDocument();
  });

  it('forgets a cleared key', async () => {
    const user = userEvent.setup();
    localStorage.setItem('gemini_api_key', 'saved-key');
    await renderApp();

    await user.click(screen.getByRole('button', { name: /API Key Set/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(localStorage.getItem('gemini_api_key')).toBeNull();
  });
});

describe('App position from an image', () => {
  const RECOGNIZED = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1';
  const MISSING_KING = '8/8/8/8/8/8/8/4K3 w - - 0 1';
  const screenshot = () => new File(['png bytes'], 'board.png', { type: 'image/png' });

  function recognized(overrides = {}) {
    return { success: true, fen: RECOGNIZED, turn_detected: false, is_valid: true, ...overrides };
  }

  async function uploadScreenshot(user) {
    await user.upload(screen.getByLabelText('Upload image file'), screenshot());
  }

  it('puts the recognized position on the board and analyzes it', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue(recognized());
    await renderApp();

    await uploadScreenshot(user);

    expect(await screen.findByText(/Position recognized/)).toBeInTheDocument();
    expect(recognizeImage).toHaveBeenCalledWith({
      image_base64: btoa('png bytes'),
      mime_type: 'image/png',
      custom_api_key: '',
    });
    expect(chessboardProps().position).toBe(RECOGNIZED);
    expect(screen.getByLabelText('FEN Position')).toHaveValue(RECOGNIZED);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(RECOGNIZED));
  });

  it('reads an image pasted with Ctrl+V / ⌘V', async () => {
    vi.mocked(recognizeImage).mockResolvedValue(recognized());
    await renderApp();

    fireEvent.paste(window, { clipboardData: { files: [screenshot()] } });

    await waitFor(() => expect(chessboardProps().position).toBe(RECOGNIZED));
  });

  it("sends the user's Gemini key along", async () => {
    const user = userEvent.setup();
    localStorage.setItem('gemini_api_key', 'my-key');
    vi.mocked(recognizeImage).mockResolvedValue(recognized());
    await renderApp();

    await uploadScreenshot(user);

    await waitFor(() =>
      expect(recognizeImage).toHaveBeenCalledWith(expect.objectContaining({ custom_api_key: 'my-key' }))
    );
  });

  it('lets the recognized position be played on', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue(recognized());
    await renderApp();
    await uploadScreenshot(user);
    await screen.findByText(/Position recognized/);

    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('f1', 'c4', 'wB');
    });

    expect(accepted).toBe(true);
  });

  it('shows an illegal position without analyzing it and locks the board', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue(recognized({ fen: MISSING_KING, is_valid: false }));
    await renderApp();
    const callsBefore = analyzeFen.mock.calls.length;

    await uploadScreenshot(user);

    expect(await screen.findByText(/recognized position is not legal/)).toBeInTheDocument();
    expect(chessboardProps().position).toBe(MISSING_KING);
    expect(chessboardProps().arePiecesDraggable).toBe(false);
    expect(analyzeFen).toHaveBeenCalledTimes(callsBefore);
    // The analysis of the previous position is gone.
    expect(screen.getByText('Ready for Engine Evaluation')).toBeInTheDocument();
  });

  it('opens the recognized position in the board editor for fixing', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue(recognized({ fen: MISSING_KING, is_valid: false }));
    await renderApp();
    await uploadScreenshot(user);

    await user.click(await screen.findByRole('button', { name: /Fix in Board Editor/ }));

    expect(screen.getByText('🧩 Chess Board Editor')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(MISSING_KING);
  });

  it('shows why an image could not be read and keeps the board as it was', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue({ success: false, error: 'No chess board was found in the image.' });
    await renderApp();

    await uploadScreenshot(user);

    expect(await screen.findByText('⚠️ No chess board was found in the image.')).toBeInTheDocument();
    expect(chessboardProps().position).toBe(START_FEN);
  });

  it('shows a request failure', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockRejectedValue(new Error('Image is larger than 10 MB.'));
    await renderApp();

    await uploadScreenshot(user);

    expect(await screen.findByText('⚠️ Image is larger than 10 MB.')).toBeInTheDocument();
  });

  it('clears the image and its error, leaving the board alone', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue({ success: false, error: 'No chess board was found in the image.' });
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Endgame (Rook + Pawn)' }));
    await uploadScreenshot(user);
    await screen.findByText(/No chess board was found/);

    await user.click(screen.getByRole('button', { name: /Clear Image/ }));

    expect(screen.queryByText(/No chess board was found/)).not.toBeInTheDocument();
    expect(screen.queryByAltText('Imported chess position')).not.toBeInTheDocument();
    expect(chessboardProps().position).toBe('8/8/5k2/R7/4P3/8/5K2/8 w - - 0 1');
  });

  it('forgets the recognition on Reset Board', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue(recognized());
    await renderApp();
    await uploadScreenshot(user);
    await screen.findByText(/Position recognized/);

    await user.click(screen.getByRole('button', { name: /Reset Board/ }));

    expect(screen.queryByText(/Position recognized/)).not.toBeInTheDocument();
  });
});

describe('App theme', () => {
  it('switches between dark and light', async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
