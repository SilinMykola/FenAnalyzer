import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import {
  analyzeFen,
  checkBackendHealth,
  getAiCommentary,
  listGeminiModels,
  recognizeImage,
} from './api/chessApi';
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

// A Chess960 game as Chess.com exports it: castling rights as rook files.
const CHESS960_PGN = `[Event "Chess960"]
[Site "Chess.com"]
[White "Kolanimir"]
[Black "Lucien093"]
[Result "*"]
[Variant "Chess960"]
[SetUp "1"]
[FEN "rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w DAda - 0 1"]
[initialSetup "rbkrnqbn/pppppppp/8/8/8/8/PPPPPPPP/RBKRNQBN w DAda - 0 1"]

1. f4 f5 2. Bd4 Nf6 3. c3 Bc4 4. d3 Bd5 *`;
const CHESS960_FINAL = 'rbkr1q1n/ppppp1pp/5n2/3b1p2/3B1P2/2PP4/PP2P1PP/RBKRNQ1N w - - 1 5';

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
  vi.mocked(listGeminiModels).mockResolvedValue({
    success: true,
    models: ['gemini-2.5-flash-lite', 'gemini-3.8-flash'],
    default_model: 'gemini-3.8-flash',
  });
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

  it('loads a Chess960 game exported by Chess.com', async () => {
    const user = userEvent.setup();
    await renderApp();

    await loadPgn(user, CHESS960_PGN);

    expect(screen.queryByText(/Failed to parse PGN/)).not.toBeInTheDocument();
    expect(document.querySelector('.pgn-counter')).toHaveTextContent('Move 8 / 8');
    expect(chessboardProps().position).toBe(CHESS960_FINAL);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(CHESS960_FINAL));
  });

  it('explains that castling in a Chess960 game is not supported', async () => {
    const user = userEvent.setup();
    await renderApp();

    await loadPgn(user, CHESS960_PGN.replace('4. d3 Bd5 *', '4. d3 Bd5 5. O-O *'));

    expect(
      screen.getByText(/Failed to parse PGN: castling in Chess960 games is not supported/)
    ).toBeInTheDocument();
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

  // The position from the bug report: built in the editor, White to move.
  const EDITOR_FEN = '4r1k1/p4pp1/7p/2Rp3q/4r1n1/3Q1NP1/PP3PP1/2R3K1 w - - 0 1';

  async function analyzeInEditor(user, fen) {
    await user.click(screen.getByRole('button', { name: /Board Editor/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: fen } });
    await user.click(screen.getByRole('button', { name: /Analyze this Setup/ }));
  }

  it('puts the side to move at the bottom when the setup is analyzed', async () => {
    const user = userEvent.setup();
    await renderApp();
    // The board was turned for Black by an earlier position.
    fireEvent.change(screen.getByLabelText('FEN Position'), {
      target: { value: '4k3/8/8/8/8/8/8/R3K3 b - - 0 1' },
    });
    expect(chessboardProps().boardOrientation).toBe('black');

    await analyzeInEditor(user, EDITOR_FEN);

    expect(chessboardProps().position).toBe(EDITOR_FEN);
    expect(chessboardProps().boardOrientation).toBe('white');
  });

  it('lets the analyzed setup be played on', async () => {
    const user = userEvent.setup();
    await renderApp();

    await analyzeInEditor(user, EDITOR_FEN);
    let accepted;
    act(() => {
      accepted = chessboardProps().onPieceDrop('d3', 'd5', 'wQ');
    });

    expect(accepted).toBe(true);
    expect(chessboardProps().position).toBe(
      '4r1k1/p4pp1/7p/2RQ3q/4r1n1/5NP1/PP3PP1/2R3K1 b - - 0 1'
    );
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
      model: '',
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
      model: '',
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

  it('sends the same image again after Gemini was overloaded', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage)
      .mockResolvedValueOnce({ success: false, error: 'Gemini servers are temporarily overloaded.' })
      .mockResolvedValueOnce(recognized());
    await renderApp();
    await uploadScreenshot(user);
    await screen.findByText('⚠️ Gemini servers are temporarily overloaded.');

    await user.click(screen.getByRole('button', { name: /Try Again/ }));

    expect(await screen.findByText(/Position recognized/)).toBeInTheDocument();
    expect(recognizeImage).toHaveBeenCalledTimes(2);
    expect(recognizeImage.mock.calls[1][0].image_base64).toBe(btoa('png bytes'));
    expect(chessboardProps().position).toBe(RECOGNIZED);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(RECOGNIZED));
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

describe('App board orientation', () => {
  const BLACK_TO_MOVE = '4k3/8/8/8/8/8/8/R3K3 b - - 0 1';
  const WHITE_TO_MOVE = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
  const orientation = () => chessboardProps().boardOrientation;

  async function loadPgn(user, pgn) {
    await user.click(screen.getByRole('button', { name: 'PGN Game Explorer' }));
    await user.click(screen.getByRole('button', { name: /Import \/ Paste PGN/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: pgn } });
    await user.click(screen.getByRole('button', { name: 'Parse & Load Game' }));
  }

  it('starts with White at the bottom', async () => {
    await renderApp();

    expect(orientation()).toBe('white');
  });

  it('puts Black at the bottom for a pasted FEN with Black to move', async () => {
    await renderApp();

    fireEvent.change(screen.getByLabelText('FEN Position'), { target: { value: BLACK_TO_MOVE } });

    expect(orientation()).toBe('black');
  });

  it('turns the board back for a FEN with White to move', async () => {
    await renderApp();
    const fenBox = screen.getByLabelText('FEN Position');
    fireEvent.change(fenBox, { target: { value: BLACK_TO_MOVE } });

    fireEvent.change(fenBox, { target: { value: WHITE_TO_MOVE } });

    expect(orientation()).toBe('white');
  });

  it('leaves the board alone while a FEN is only half typed', async () => {
    await renderApp();
    const fenBox = screen.getByLabelText('FEN Position');
    fireEvent.change(fenBox, { target: { value: BLACK_TO_MOVE } });

    fireEvent.change(fenBox, { target: { value: '4k3/8/8' } });

    expect(orientation()).toBe('black');
  });

  it('puts the side to move at the bottom after a PGN is loaded', async () => {
    const user = userEvent.setup();
    await renderApp();

    // 1. e4 e5 2. Nf3 ends with Black to move.
    await loadPgn(user, PGN);

    expect(orientation()).toBe('black');
  });

  it('keeps White at the bottom for a PGN that ends with White to move', async () => {
    const user = userEvent.setup();
    await renderApp();

    await loadPgn(user, '1. e4 e5 *');

    expect(orientation()).toBe('white');
  });

  it('does not turn the board while stepping through a loaded game', async () => {
    const user = userEvent.setup();
    await renderApp();
    await loadPgn(user, PGN);

    await user.click(screen.getByTitle(/Previous move/));

    expect(chessboardProps().position).toBe(AFTER_E4_E5);
    expect(orientation()).toBe('black');
  });

  it('puts the side to move at the bottom for a position read from an image', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue({
      success: true,
      fen: BLACK_TO_MOVE,
      turn_detected: true,
      is_valid: true,
    });
    await renderApp();

    await user.upload(
      screen.getByLabelText('Upload image file'),
      new File(['png bytes'], 'board.png', { type: 'image/png' })
    );

    await screen.findByText(/Position recognized/);
    expect(orientation()).toBe('black');
  });

  it('does not turn the board when a move is played on it', async () => {
    await renderApp();

    act(() => {
      chessboardProps().onPieceDrop('e2', 'e4', 'wP');
    });

    expect(chessboardProps().position).toBe(AFTER_E4);
    expect(orientation()).toBe('white');
  });

  it('can still be flipped by hand after a load', async () => {
    const user = userEvent.setup();
    await renderApp();
    fireEvent.change(screen.getByLabelText('FEN Position'), { target: { value: BLACK_TO_MOVE } });

    await user.click(screen.getByRole('button', { name: /Flip \(black\)/ }));

    expect(orientation()).toBe('white');
  });

  it('puts White back at the bottom on Reset Board', async () => {
    const user = userEvent.setup();
    await renderApp();
    fireEvent.change(screen.getByLabelText('FEN Position'), { target: { value: BLACK_TO_MOVE } });

    await user.click(screen.getByRole('button', { name: /Reset Board/ }));

    expect(orientation()).toBe('white');
  });
});

describe('App your moves since a loaded position', () => {
  // The position from the user's image, Black to move, and two moves on it.
  const IMAGE_FEN = 'r5k1/1Qp1bppp/1n1qp3/1B1p4/3P2b1/2P1P3/PP1N1PPP/R1B2RK1 b - - 4 19';
  const AFTER_KH8 = 'r6k/1Qp1bppp/1n1qp3/1B1p4/3P2b1/2P1P3/PP1N1PPP/R1B2RK1 w - - 5 20';
  const AFTER_H3 = 'r6k/1Qp1bppp/1n1qp3/1B1p4/3P2b1/2P1P2P/PP1N1PP1/R1B2RK1 b - - 0 20';
  const AFTER_QXC7 = 'r6k/2Q1bppp/1n1qp3/1B1p4/3P2b1/2P1P3/PP1N1PPP/R1B2RK1 b - - 0 20';

  const strip = () => screen.queryByLabelText('Your moves');
  const move = (name) => within(strip()).getByRole('button', { name });
  const drop = (from, to) => act(() => chessboardProps().onPieceDrop(from, to, 'xx'));

  async function loadImagePosition(user) {
    vi.mocked(recognizeImage).mockResolvedValue({
      success: true,
      fen: IMAGE_FEN,
      turn_detected: true,
      is_valid: true,
    });
    await user.upload(
      screen.getByLabelText('Upload image file'),
      new File(['png bytes'], 'board.png', { type: 'image/png' })
    );
    await screen.findByText(/Position recognized/);
  }

  async function playTwoMoves(user) {
    await renderApp();
    await loadImagePosition(user);
    drop('g8', 'h8');
    drop('h2', 'h3');
  }

  it('shows nothing until a move is played on a loaded position', async () => {
    const user = userEvent.setup();
    await renderApp();

    await loadImagePosition(user);

    expect(strip()).not.toBeInTheDocument();
  });

  it('lists the moves played since the image was read, with its FEN', async () => {
    const user = userEvent.setup();

    await playTwoMoves(user);

    expect(move('19… Kh8')).toBeInTheDocument();
    expect(move('20. h3')).toHaveAttribute('aria-current', 'step');
    expect(within(strip()).getByText(IMAGE_FEN)).toBeInTheDocument();
    expect(chessboardProps().position).toBe(AFTER_H3);
  });

  it('goes back to the position from the image and analyzes it', async () => {
    const user = userEvent.setup();
    await playTwoMoves(user);

    await user.click(move('Start'));

    expect(chessboardProps().position).toBe(IMAGE_FEN);
    expect(screen.getByLabelText('FEN Position')).toHaveValue(IMAGE_FEN);
    await waitFor(() => expect(lastAnalyzedFen()).toBe(IMAGE_FEN));
    // The moves stay, so the user can go forward again.
    await user.click(move('20. h3'));
    expect(chessboardProps().position).toBe(AFTER_H3);
  });

  it('steps back and forth with the buttons', async () => {
    const user = userEvent.setup();
    await playTwoMoves(user);

    await user.click(screen.getByTitle('Back one move'));
    expect(chessboardProps().position).toBe(AFTER_KH8);

    await user.click(screen.getByTitle('Back to the loaded position'));
    expect(chessboardProps().position).toBe(IMAGE_FEN);

    await user.click(screen.getByTitle('To your last move'));
    expect(chessboardProps().position).toBe(AFTER_H3);
  });

  it('steps back and forth with the arrow keys on the FEN tab', async () => {
    const user = userEvent.setup();
    await playTwoMoves(user);
    // Take the focus off the file input: keys typed into a field are not moves.
    await user.click(move('20. h3'));

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(chessboardProps().position).toBe(IMAGE_FEN);

    // Nothing before the start.
    await user.keyboard('{ArrowLeft}');
    expect(chessboardProps().position).toBe(IMAGE_FEN);

    await user.keyboard('{ArrowRight}');
    expect(chessboardProps().position).toBe(AFTER_KH8);
  });

  it('lets moves be played again from a stepped-back position', async () => {
    const user = userEvent.setup();
    await playTwoMoves(user);
    await user.click(move('19… Kh8'));

    drop('b7', 'c7');

    expect(chessboardProps().position).toBe(AFTER_QXC7);
    expect(move('20. Qxc7')).toHaveAttribute('aria-current', 'step');
    // The old continuation is replaced by the new one.
    expect(within(strip()).queryByRole('button', { name: '20. h3' })).not.toBeInTheDocument();
  });

  it("adds the engine's best move to the list", async () => {
    const user = userEvent.setup();
    await renderApp();

    await user.click(screen.getByRole('button', { name: /Play Best Move/ }));

    expect(move('1. e4')).toBeInTheDocument();
    await user.click(move('Start'));
    expect(chessboardProps().position).toBe(START_FEN);
  });

  it('adds the moves of an engine line played from the preview', async () => {
    const user = userEvent.setup();
    await renderApp();
    const line = document.querySelector('.line-item');
    await user.click(within(line).getByRole('button', { name: 'e5' }));

    await user.click(screen.getByRole('button', { name: /Play from here/ }));

    expect(move('1. e4')).toBeInTheDocument();
    expect(move('1… e5')).toHaveAttribute('aria-current', 'step');
  });

  it('starts afresh when another position is loaded', async () => {
    const user = userEvent.setup();
    await playTwoMoves(user);

    fireEvent.change(screen.getByLabelText('FEN Position'), {
      target: { value: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1' },
    });

    expect(strip()).not.toBeInTheDocument();
    drop('a1', 'a7');
    expect(move('1. Ra7')).toBeInTheDocument();
    expect(within(strip()).getByText('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')).toBeInTheDocument();
  });

  it('forgets the moves on Reset Board', async () => {
    const user = userEvent.setup();
    await playTwoMoves(user);

    await user.click(screen.getByRole('button', { name: /Reset Board/ }));

    expect(strip()).not.toBeInTheDocument();
  });
});

describe('App Gemini model and pause', () => {
  const picker = () => screen.getByLabelText('Gemini model');
  const askButton = () => screen.getByRole('button', { name: /Ask Grandmaster|Ask again in/ });
  const QUOTA_ERROR =
    'Gemini refused the request: too many requests, or the API key\'s quota for this model is used up.';
  const refused = (seconds, model = 'gemini-3.8-flash') => ({
    success: false,
    commentary: '',
    model,
    error: QUOTA_ERROR,
    retry_after_seconds: seconds,
  });

  // Only the countdown's clock is faked; promises and React stay real.
  function fakeClock() {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  }
  afterEach(() => vi.useRealTimers());

  async function uploadScreenshot(user) {
    await user.upload(
      screen.getByLabelText('Upload image file'),
      new File(['png bytes'], 'board.png', { type: 'image/png' })
    );
  }

  it('offers the models the key can use, with the server default first', async () => {
    await renderApp();

    await waitFor(() => expect(within(picker()).getAllByRole('option')).toHaveLength(3));
    expect(within(picker()).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Default (gemini-3.8-flash)',
      'gemini-2.5-flash-lite',
      'gemini-3.8-flash',
    ]);
    expect(picker()).toHaveValue('');
  });

  it('asks the chosen model and remembers it', async () => {
    const user = userEvent.setup();
    await renderApp();
    await within(picker()).findByRole('option', { name: 'gemini-2.5-flash-lite' });

    await user.selectOptions(picker(), 'gemini-2.5-flash-lite');
    await user.click(askButton());

    expect(getAiCommentary.mock.calls[0][0].model).toBe('gemini-2.5-flash-lite');
    expect(localStorage.getItem('gemini_model')).toBe('gemini-2.5-flash-lite');
  });

  it('reads images with the chosen model too', async () => {
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue({ success: false, error: 'nope' });
    localStorage.setItem('gemini_model', 'gemini-2.5-flash-lite');
    await renderApp();

    await uploadScreenshot(user);

    await waitFor(() => expect(recognizeImage).toHaveBeenCalled());
    expect(recognizeImage.mock.calls[0][0].model).toBe('gemini-2.5-flash-lite');
  });

  it('keeps a saved model selected even when the list cannot be fetched', async () => {
    vi.mocked(listGeminiModels).mockRejectedValue(new Error('offline'));
    localStorage.setItem('gemini_model', 'gemini-2.5-pro');
    await renderApp();

    expect(picker()).toHaveValue('gemini-2.5-pro');
  });

  it('asks for the model list again with a new API key', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: /Set API Key/ }));

    await user.type(screen.getByLabelText(/Gemini API Key/), 'new-key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(listGeminiModels).toHaveBeenLastCalledWith({ custom_api_key: 'new-key' })
    );
  });

  it('locks Ask Grandmaster with a countdown after a quota refusal, then unlocks it', async () => {
    fakeClock();
    const user = userEvent.setup();
    vi.mocked(getAiCommentary).mockResolvedValue(refused(44));
    await renderApp();
    await within(picker()).findByRole('option', { name: 'Default (gemini-3.8-flash)' });

    await user.click(askButton());

    expect(await screen.findByText(/quota for this model is used up/)).toBeInTheDocument();
    expect(askButton()).toBeDisabled();
    expect(askButton()).toHaveTextContent('Ask again in 0:44');

    act(() => vi.advanceTimersByTime(10_000));
    expect(askButton()).toHaveTextContent('Ask again in 0:34');

    act(() => vi.advanceTimersByTime(34_000));
    expect(askButton()).toBeEnabled();
    expect(askButton()).toHaveTextContent('Ask Grandmaster');
  });

  it('locks Try Again with a countdown after a quota refusal, then unlocks it', async () => {
    fakeClock();
    const user = userEvent.setup();
    vi.mocked(recognizeImage).mockResolvedValue({
      success: false,
      model: 'gemini-3.8-flash',
      error: QUOTA_ERROR,
      retry_after_seconds: 12 * 3600 + 21 * 60 + 45,
    });
    await renderApp();
    await within(picker()).findByRole('option', { name: 'Default (gemini-3.8-flash)' });

    await uploadScreenshot(user);

    expect(await screen.findByRole('timer')).toHaveTextContent('12:21:45');
    expect(screen.getByRole('button', { name: /Try Again/ })).toBeDisabled();
    // The same quota blocks the commentary as well.
    expect(askButton()).toBeDisabled();

    act(() => vi.advanceTimersByTime((12 * 3600 + 21 * 60 + 45) * 1000));
    expect(screen.getByRole('button', { name: /Try Again/ })).toBeEnabled();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('lifts the pause when another model is chosen, and brings it back for the blocked one', async () => {
    fakeClock();
    const user = userEvent.setup();
    vi.mocked(getAiCommentary).mockResolvedValue(refused(600));
    await renderApp();
    await within(picker()).findByRole('option', { name: 'gemini-2.5-flash-lite' });
    await user.click(askButton());
    await waitFor(() => expect(askButton()).toBeDisabled());

    await user.selectOptions(picker(), 'gemini-2.5-flash-lite');
    expect(askButton()).toBeEnabled();

    await user.selectOptions(picker(), '');
    expect(askButton()).toHaveTextContent('Ask again in 10:00');
  });

  it('remembers the pause across a page reload', async () => {
    fakeClock();
    const user = userEvent.setup();
    vi.mocked(getAiCommentary).mockResolvedValue(refused(600));
    const { unmount } = render(<App />);
    await screen.findByText('Even position (balanced game)');
    await within(picker()).findByRole('option', { name: 'Default (gemini-3.8-flash)' });
    await user.click(askButton());
    await waitFor(() => expect(askButton()).toBeDisabled());
    unmount();

    await renderApp();

    await waitFor(() => expect(askButton()).toHaveTextContent('Ask again in 10:00'));
  });

  it('sends Try Again to the model chosen right by the countdown', async () => {
    fakeClock();
    const user = userEvent.setup();
    vi.mocked(recognizeImage)
      .mockResolvedValueOnce({
        success: false,
        model: 'gemini-3.8-flash',
        error: QUOTA_ERROR,
        retry_after_seconds: 43000,
      })
      .mockResolvedValueOnce({
        success: true,
        fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
        turn_detected: true,
        is_valid: true,
        model: 'gemini-2.5-flash-lite',
      });
    await renderApp();
    await within(picker()).findByRole('option', { name: 'gemini-2.5-flash-lite' });
    await uploadScreenshot(user);
    const inline = await screen.findByLabelText('Switch Gemini model for reading images');

    await user.selectOptions(inline, 'gemini-2.5-flash-lite');

    // The choice is the same everywhere, and the other model is not paused.
    expect(picker()).toHaveValue('gemini-2.5-flash-lite');
    const tryAgain = screen.getByRole('button', { name: /Try Again/ });
    expect(tryAgain).toBeEnabled();

    await user.click(tryAgain);

    expect(await screen.findByText(/Position recognized/)).toBeInTheDocument();
    expect(recognizeImage).toHaveBeenCalledTimes(2);
    expect(recognizeImage.mock.calls[0][0].model).toBe('');
    expect(recognizeImage.mock.calls[1][0].model).toBe('gemini-2.5-flash-lite');
    expect(recognizeImage.mock.calls[1][0].image_base64).toBe(btoa('png bytes'));
  });

  it('asks the Grandmaster with the model chosen right by the countdown', async () => {
    fakeClock();
    const user = userEvent.setup();
    vi.mocked(getAiCommentary)
      .mockResolvedValueOnce(refused(43000))
      .mockResolvedValueOnce({ success: true, commentary: 'Develop the knight.' });
    await renderApp();
    await within(picker()).findByRole('option', { name: 'gemini-2.5-flash-lite' });
    await user.click(askButton());
    const inline = await screen.findByLabelText('Switch Gemini model for the commentary');

    await user.selectOptions(inline, 'gemini-2.5-flash-lite');
    await user.click(askButton());

    expect(await screen.findByText('"Develop the knight."')).toBeInTheDocument();
    expect(getAiCommentary.mock.calls[1][0].model).toBe('gemini-2.5-flash-lite');
    // Nothing to wait for on this model, so the picker by the countdown is gone.
    expect(screen.queryByLabelText('Switch Gemini model for the commentary')).not.toBeInTheDocument();
  });

  it('does not pause after an error that is not about load or quota', async () => {
    const user = userEvent.setup();
    vi.mocked(getAiCommentary).mockResolvedValue({
      success: false,
      commentary: '',
      model: 'gemini-3.8-flash',
      error: 'Gemini API error (400): API key not valid',
    });
    await renderApp();

    await user.click(askButton());

    expect(await screen.findByText(/API key not valid/)).toBeInTheDocument();
    expect(askButton()).toBeEnabled();
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
