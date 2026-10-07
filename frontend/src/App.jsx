import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import FenInput from './components/FenInput';
import BoardView from './components/BoardView';
import AnalysisPanel from './components/AnalysisPanel';
import PgnViewer from './components/PgnViewer';
import BoardEditor from './components/BoardEditor';
import { analyzeFen, checkBackendHealth, getAiCommentary } from './api/chessApi';
import { playMoveSound } from './utils/sound';
import useTheme from './hooks/useTheme';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default function App() {
  // Mode: 'fen' or 'pgn'
  const [activeTab, setActiveTab] = useState('fen');
  const { theme, toggleTheme } = useTheme();

  // Internal chess.js instance for rules, move validation, and PGN parsing
  const gameRef = useRef(new Chess());
  // The position on the board, and the text in the FEN box. They are the same
  // except after a reset, which puts the starting position on the board but
  // leaves the box empty for the next FEN.
  const [fen, setFen] = useState(DEFAULT_FEN);
  const [fenInput, setFenInput] = useState(DEFAULT_FEN);

  // Puts a position on the board and shows its FEN in the box.
  const showPosition = (newFen) => {
    setFen(newFen);
    setFenInput(newFen);
  };

  // Engine controls
  const [depth, setDepth] = useState(16);
  const [multipv, setMultipv] = useState(3);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);

  // PGN state
  const [pgnText, setPgnText] = useState('');
  const [pgnMoves, setPgnMoves] = useState([]);
  const [pgnHeaders, setPgnHeaders] = useState({});
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const pgnFensRef = useRef([]);

  // Gemini AI Commentary state
  const [aiCommentary, setAiCommentary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [customApiKey, setCustomApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });

  // Check backend health on initial load
  useEffect(() => {
    checkBackendHealth().then((res) => {
      setBackendOnline(res.ok);
    });
  }, []);

  // Main Stockfish request function
  const triggerAnalysis = useCallback(
    async (fenToAnalyze, targetDepth = depth, targetMultipv = multipv) => {
      if (!fenToAnalyze || !fenToAnalyze.trim()) return;

      setLoading(true);
      setError(null);
      setAnalysis(null);
      // Clear previous position's AI commentary
      setAiCommentary(null);
      setAiError(null);

      try {
        const data = await analyzeFen(fenToAnalyze, targetDepth, targetMultipv);
        setAnalysis(data);
        setBackendOnline(true);
      } catch (err) {
        setError(err.message || 'Analysis request failed');
      } finally {
        setLoading(false);
      }
    },
    [depth, multipv]
  );

  // Analyze starting position on mount
  useEffect(() => {
    triggerAnalysis(DEFAULT_FEN);
  }, [triggerAnalysis]);

  // Variation Preview state (for clicking moves in Stockfish engine lines)
  const [variationPreview, setVariationPreview] = useState(null);

  // Handler for manual FEN update (e.g. typing or preset button)
  const handleFenChange = (newFen) => {
    setVariationPreview(null);
    showPosition(newFen);
    setError(null);
    try {
      gameRef.current.load(newFen);
    } catch (e) {
      // Allow partial typing in input
    }
  };

  // Preview interactive moves from Stockfish PV
  const handlePreviewVariation = (lineRank, moves, stepIndex) => {
    try {
      const tempGame = new Chess(fen);
      for (let i = 0; i <= stepIndex; i++) {
        tempGame.move(moves[i]);
      }
      playMoveSound(false);
      setVariationPreview({
        lineRank,
        moves,
        stepIndex,
        previewFen: tempGame.fen(),
      });
    } catch (err) {
      console.warn('Failed to replay variation moves:', err);
    }
  };

  const handleStepVariation = (delta) => {
    if (!variationPreview) return;
    const newIndex = variationPreview.stepIndex + delta;
    if (newIndex < 0) {
      setVariationPreview(null);
      playMoveSound(false);
      return;
    }
    if (newIndex >= variationPreview.moves.length) return;
    handlePreviewVariation(variationPreview.lineRank, variationPreview.moves, newIndex);
  };

  const handleExitVariationPreview = () => {
    setVariationPreview(null);
    playMoveSound(false);
  };

  const handleApplyVariationAsCurrent = () => {
    if (!variationPreview) return;
    const targetFen = variationPreview.previewFen;
    gameRef.current.load(targetFen);
    showPosition(targetFen);
    setVariationPreview(null);
    playMoveSound(false);
    triggerAnalysis(targetFen);
  };

  // Reset to Starting Position (Clears board, PGN, and inputs)
  const handleResetToStartingPosition = () => {
    setVariationPreview(null);
    gameRef.current.load(DEFAULT_FEN);
    setFen(DEFAULT_FEN);
    setFenInput('');
    setPgnText('');
    setPgnMoves([]);
    setPgnHeaders({});
    setCurrentMoveIndex(-1);
    pgnFensRef.current = [DEFAULT_FEN];
    setAiCommentary(null);
    setAiError(null);
    setError(null);
    playMoveSound(false);
    triggerAnalysis(DEFAULT_FEN);
  };

  // Handler for making a move via Drag & Drop on the board
  const handlePieceDrop = (sourceSquare, targetSquare) => {
    setVariationPreview(null);
    try {
      const move = gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // Default auto-queen for convenience
      });

      if (move === null) return false;

      playMoveSound(Boolean(move.captured));
      const newFen = gameRef.current.fen();
      showPosition(newFen);

      // Auto-trigger Stockfish re-analysis
      triggerAnalysis(newFen);
      return true;
    } catch (err) {
      return false;
    }
  };

  // Handler for "Play Best Move" button
  const handlePlayBestMove = () => {
    const bestMove = analysis?.lines?.[0]?.move_uci;
    if (!bestMove || bestMove.length < 4) return;

    const from = bestMove.slice(0, 2);
    const to = bestMove.slice(2, 4);
    const promotion = bestMove.length > 4 ? bestMove[4] : 'q';

    try {
      const move = gameRef.current.move({ from, to, promotion });
      if (move) {
        playMoveSound(Boolean(move.captured));
        const newFen = gameRef.current.fen();
        showPosition(newFen);
        triggerAnalysis(newFen);
      }
    } catch (e) {
      setError(`Cannot execute move: ${e.message}`);
    }
  };

  // PGN Import & Parsing
  const handleLoadPgn = (pgnString) => {
    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(pgnString);

      const headers = pgnGame.header();
      const history = pgnGame.history({ verbose: true });

      // Support thematic games or custom starting positions (e.g. Chess.com SetUp "1" + FEN)
      const startFen = headers.FEN || DEFAULT_FEN;
      const replayGame = new Chess(startFen);
      const fens = [startFen];
      for (const m of history) {
        replayGame.move(m);
        fens.push(replayGame.fen());
      }

      pgnFensRef.current = fens;
      setPgnMoves(history);
      setPgnHeaders(headers);
      setCurrentMoveIndex(history.length - 1);

      // Set board to final position of the game
      const finalFen = fens[fens.length - 1];
      gameRef.current.load(finalFen);
      showPosition(finalFen);
      triggerAnalysis(finalFen);
      setError(null);
    } catch (err) {
      setError(`Failed to parse PGN: ${err.message}`);
    }
  };

  // PGN Move Selection
  const handleSelectPgnMove = (index) => {
    if (index < -1 || index >= pgnMoves.length) return;
    setCurrentMoveIndex(index);
    const targetFen = pgnFensRef.current[index + 1] || DEFAULT_FEN;
    gameRef.current.load(targetFen);
    showPosition(targetFen);
    playMoveSound(false);
    triggerAnalysis(targetFen);
  };

  const handlePrevMove = () => {
    if (currentMoveIndex > -1) {
      handleSelectPgnMove(currentMoveIndex - 1);
    }
  };

  const handleNextMove = () => {
    if (currentMoveIndex < pgnMoves.length - 1) {
      handleSelectPgnMove(currentMoveIndex + 1);
    }
  };

  // Ask Grandmaster AI Commentary handler
  const handleAskGrandmaster = async () => {
    if (!analysis || !analysis.lines || analysis.lines.length === 0) return;

    const topChoice = analysis.lines[0];
    setAiLoading(true);
    setAiError(null);

    try {
      const res = await getAiCommentary({
        fen,
        turn: analysis.turn,
        score: topChoice.score,
        best_move_san: topChoice.move_san,
        explanation: topChoice.explanation,
        verbal_verdict: analysis.verbal_verdict,
        custom_api_key: customApiKey,
      });

      if (!res.success) {
        setAiError(res.error || 'Failed to generate commentary');
      } else {
        setAiCommentary(res.commentary);
      }
    } catch (err) {
      setAiError(err.message || 'Error communicating with AI endpoint');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveCustomApiKey = (key) => {
    setCustomApiKey(key);
    if (key) {
      localStorage.setItem('gemini_api_key', key);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  };

  // Keyboard navigation for PGN stepping
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeTab !== 'pgn' || pgnMoves.length === 0) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevMove();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextMove();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, pgnMoves, currentMoveIndex]);

  const bestMove = analysis?.lines?.[0]?.move_uci || null;
  const isGameOver = analysis?.is_checkmate || analysis?.is_stalemate || false;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <span className="logo-icon">♟️</span>
          <div>
            <h1>FEN & PGN Chess Analyzer</h1>
            <p className="subtitle">
              Interactive Stockfish engine analysis, WDL probabilities & Gemini AI coach
            </p>
          </div>
        </div>

        <div className="header-right">
          {/* Tab Navigation */}
          <div className="tab-pill-container">
            <button
              type="button"
              className={`tab-pill ${activeTab === 'fen' ? 'active' : ''}`}
              onClick={() => setActiveTab('fen')}
            >
              FEN Analyzer
            </button>
            <button
              type="button"
              className={`tab-pill ${activeTab === 'pgn' ? 'active' : ''}`}
              onClick={() => setActiveTab('pgn')}
            >
              PGN Game Explorer
            </button>
            <button
              type="button"
              className={`tab-pill ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              🧩 Board Editor
            </button>
          </div>

          {/* Reset / New Game button */}
          <button
            type="button"
            className="btn-reset-header"
            onClick={handleResetToStartingPosition}
            title="Reset board and clear inputs to initial position"
          >
            🔄 Reset Board
          </button>

          {/* Backend Status indicator */}
          <div className="backend-indicator">
            <span
              className={`status-dot ${
                backendOnline === true
                  ? 'online'
                  : backendOnline === false
                  ? 'offline'
                  : 'checking'
              }`}
            />
            <span className="status-text">
              {backendOnline === true
                ? 'Stockfish Ready'
                : backendOnline === false
                ? 'Backend Offline'
                : 'Connecting...'}
            </span>
          </div>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'editor' ? (
          <BoardEditor
            initialFen={fen}
            onApplyFen={(newFen) => {
              setVariationPreview(null);
              showPosition(newFen);
              setActiveTab('fen');
              playMoveSound(false);
              triggerAnalysis(newFen);
            }}
          />
        ) : (
          <>
            {/* Top Control Section: FEN or PGN based on activeTab */}
            <section className="input-section">
              {activeTab === 'fen' ? (
                <FenInput
                  fen={fenInput}
                  onFenChange={handleFenChange}
                  depth={depth}
                  onDepthChange={setDepth}
                  multipv={multipv}
                  onMultipvChange={setMultipv}
                  onAnalyze={() => triggerAnalysis(fen)}
                  loading={loading}
                />
              ) : (
                <PgnViewer
                  pgnText={pgnText}
                  onPgnTextChange={setPgnText}
                  onLoadPgn={handleLoadPgn}
                  onResetGame={handleResetToStartingPosition}
                  moves={pgnMoves}
                  currentMoveIndex={currentMoveIndex}
                  onSelectMove={handleSelectPgnMove}
                  onPrevMove={handlePrevMove}
                  onNextMove={handleNextMove}
                  onFirstMove={() => handleSelectPgnMove(-1)}
                  onLastMove={() => handleSelectPgnMove(pgnMoves.length - 1)}
                  headers={pgnHeaders}
                />
              )}
            </section>

            {/* Error notification banner */}
            {error && (
              <div className="alert-banner">
                <span className="alert-icon">⚠️</span>
                <div className="alert-content">
                  <strong>Notice:</strong> {error}
                </div>
                <button className="alert-close" onClick={() => setError(null)}>
                  ✕
                </button>
              </div>
            )}

            {/* Two-column layout: Board on left, Analysis on right */}
            <div className="dashboard-grid">
              <div className="board-column">
                {variationPreview && (
                  <div className="variation-preview-banner">
                    <div className="vpb-info">
                      <span className="vpb-badge">Line #{variationPreview.lineRank}</span>
                      <span className="vpb-step">
                        Move {variationPreview.stepIndex + 1}/{variationPreview.moves.length}:{' '}
                        <strong>{variationPreview.moves[variationPreview.stepIndex]}</strong>
                      </span>
                    </div>
                    <div className="vpb-actions">
                      <button
                        type="button"
                        className="btn-vpb"
                        onClick={() => handleStepVariation(-1)}
                        title="Previous move"
                      >
                        ◀ Prev
                      </button>
                      <button
                        type="button"
                        className="btn-vpb"
                        onClick={() => handleStepVariation(1)}
                        disabled={variationPreview.stepIndex >= variationPreview.moves.length - 1}
                        title="Next move"
                      >
                        Next ▶
                      </button>
                      <button
                        type="button"
                        className="btn-vpb btn-vpb-play"
                        onClick={handleApplyVariationAsCurrent}
                        title="Set position as current and analyze"
                      >
                        ✅ Play from here
                      </button>
                      <button
                        type="button"
                        className="btn-vpb btn-vpb-exit"
                        onClick={handleExitVariationPreview}
                        title="Exit preview and return to base position"
                      >
                        ✕ Exit
                      </button>
                    </div>
                  </div>
                )}
                <BoardView
                  fen={variationPreview ? variationPreview.previewFen : fen}
                  bestMove={variationPreview ? null : bestMove}
                  turn={analysis?.turn}
                  onPieceDrop={handlePieceDrop}
                  onPlayBestMove={handlePlayBestMove}
                  isGameOver={isGameOver || Boolean(variationPreview)}
                />
              </div>

              <div className="analysis-column">
                <AnalysisPanel
                  analysis={analysis}
                  loading={loading}
                  onAskGrandmaster={handleAskGrandmaster}
                  aiCommentary={aiCommentary}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  customApiKey={customApiKey}
                  onSaveCustomApiKey={handleSaveCustomApiKey}
                  variationPreview={variationPreview}
                  onPreviewVariation={handlePreviewVariation}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
