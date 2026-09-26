import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import FenInput from './components/FenInput';
import BoardView from './components/BoardView';
import AnalysisPanel from './components/AnalysisPanel';
import PgnViewer from './components/PgnViewer';
import { analyzeFen, checkBackendHealth } from './api/chessApi';
import { playMoveSound } from './utils/sound';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default function App() {
  // Mode: 'fen' or 'pgn'
  const [activeTab, setActiveTab] = useState('fen');

  // Internal chess.js instance for rules, move validation, and PGN parsing
  const gameRef = useRef(new Chess());
  const [fen, setFen] = useState(DEFAULT_FEN);

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

  // Handler for manual FEN update (e.g. typing or preset button)
  const handleFenChange = (newFen) => {
    setFen(newFen);
    setError(null);
    try {
      gameRef.current.load(newFen);
    } catch (e) {
      // Allow partial typing in input
    }
  };

  // Handler for making a move via Drag & Drop on the board
  const handlePieceDrop = (sourceSquare, targetSquare) => {
    try {
      const move = gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q', // Default auto-queen for convenience
      });

      if (move === null) return false;

      playMoveSound(Boolean(move.captured));
      const newFen = gameRef.current.fen();
      setFen(newFen);

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
        setFen(newFen);
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
      setFen(finalFen);
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
    setFen(targetFen);
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
              Interactive Stockfish engine analysis, WDL probabilities & tactics
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
          </div>

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
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Control Section: FEN or PGN based on activeTab */}
        <section className="input-section">
          {activeTab === 'fen' ? (
            <FenInput
              fen={fen}
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
            <BoardView
              fen={fen}
              bestMove={bestMove}
              turn={analysis?.turn}
              onPieceDrop={handlePieceDrop}
              onPlayBestMove={handlePlayBestMove}
              isGameOver={isGameOver}
            />
          </div>

          <div className="analysis-column">
            <AnalysisPanel analysis={analysis} loading={loading} />
          </div>
        </div>
      </main>
    </div>
  );
}
