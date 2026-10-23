import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chess } from 'chess.js';
import FenInput from './components/FenInput';
import BoardView from './components/BoardView';
import AnalysisPanel from './components/AnalysisPanel';
import PgnViewer from './components/PgnViewer';
import BoardEditor from './components/BoardEditor';
import ImageImport from './components/ImageImport';
import ModelPicker from './components/ModelPicker';
import MoveLine from './components/MoveLine';
import {
  analyzeFen,
  calibrateLocalReader,
  checkBackendHealth,
  getAiCommentary,
  getLocalReaderStatus,
  listGeminiModels,
  parsePgn,
  recognizeImage,
} from './api/chessApi';
import { readImageAsBase64 } from './utils/imageFile';
import { isChess960Pgn, withStandardCastling, withStandardCastlingPgn } from './utils/pgn';
import { addMove, goTo, shownFen, startLine } from './utils/moveLine';
import { getPositionError, rotateFen } from './utils/editorFen';
import { playMoveSound } from './utils/sound';
import useTheme from './hooks/useTheme';
import useGeminiCooldown from './hooks/useGeminiCooldown';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// The colour whose turn it is in a FEN, as react-chessboard names orientations.
const sideToMove = (fen) => (fen.split(' ')[1] === 'b' ? 'black' : 'white');

// The image box's model picker also offers the local reader, which reads
// screenshots on this machine against a board calibrated by the user.
const LOCAL_READER = 'local';
const LOCAL_READER_OPTIONS = [{ value: LOCAL_READER, label: '📍 Local (calibrated board)' }];

export default function App() {
  // Mode: 'fen' or 'pgn'
  const [activeTab, setActiveTab] = useState('fen');
  const { theme, toggleTheme } = useTheme();

  // Internal chess.js instance for rules, move validation, and PGN parsing
  const gameRef = useRef(new Chess());
  // Whether the position on the board comes from a Chess960 game. Stockfish
  // then plays Chess960 castling; a ref, so analysis reads it at once.
  const chess960Ref = useRef(false);

  // Loads a position into chess.js, which knows only standard castling: rights
  // written as rook files (a Chess960 game) are dropped there. The board and
  // the analysis keep the full FEN. Returns whether chess.js took it.
  const loadGame = (newFen) => {
    try {
      gameRef.current.load(withStandardCastling(newFen));
      return true;
    } catch {
      return false;
    }
  };
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

  // Which side of the board is at the bottom. A position loaded from a FEN,
  // a PGN or an image turns the board so the side to move plays from below.
  const [orientation, setOrientation] = useState('white');

  // Engine controls
  const [depth, setDepth] = useState(20);
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
  // Gemini's answer to "why is the position rated so?":
  // { status: 'idle' | 'loading' | 'done' | 'error', text, error }
  const [evalExplanation, setEvalExplanation] = useState({ status: 'idle' });
  const [customApiKey, setCustomApiKey] = useState(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });

  // The Gemini model to ask; '' is the server's default. The list comes from
  // the backend, which asks Google what the API key can use.
  const [geminiModel, setGeminiModel] = useState(() => {
    return localStorage.getItem('gemini_model') || '';
  });
  const [geminiModels, setGeminiModels] = useState({ models: [], defaultModel: null });
  const activeGeminiModel = geminiModel || geminiModels.defaultModel;
  // Seconds Gemini asked to wait before the next request to this model.
  const { secondsLeft: geminiWait, startCooldown: startGeminiCooldown } =
    useGeminiCooldown(activeGeminiModel);

  // Reading a position from an image: { status, error, fen, turnDetected, isValid }
  const [imageRecognition, setImageRecognition] = useState({ status: 'idle' });

  // Who reads images: Gemini, or the local reader. The local reader first
  // needs a screenshot of the starting position to learn the board from.
  const [readsLocally, setReadsLocally] = useState(
    () => localStorage.getItem('image_reader') === LOCAL_READER
  );
  // Whether the local reader is calibrated; null until the backend says.
  const [localCalibrated, setLocalCalibrated] = useState(null);
  // The user asked to calibrate again, from a new screenshot.
  const [recalibrating, setRecalibrating] = useState(false);
  const needsCalibration = readsLocally && (recalibrating || localCalibrated === false);

  const refreshLocalReaderStatus = useCallback(async () => {
    try {
      const res = await getLocalReaderStatus();
      setLocalCalibrated(Boolean(res?.calibrated));
    } catch {
      // Unknown while the backend is down; reading will say what is wrong.
    }
  }, []);

  useEffect(() => {
    refreshLocalReaderStatus();
  }, [refreshLocalReaderStatus]);

  // Fetch the models the key can use; a new key may open up other models.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listGeminiModels({ custom_api_key: customApiKey });
        if (cancelled || !res) return;
        setGeminiModels({
          models: res.success ? res.models : [],
          defaultModel: res.default_model || null,
        });
      } catch {
        // Without the list the picker still offers the default model.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customApiKey]);

  // Gemini refused for load or quota and said how long to wait.
  const pauseGeminiAfter = (res) => {
    if (res && !res.success && res.retry_after_seconds) {
      startGeminiCooldown(res.model || activeGeminiModel, res.retry_after_seconds);
    }
  };

  // Stable between renders: the pickers skip re-rendering while it stays the
  // same, so the once-a-second countdown does not redraw an open dropdown
  // (which closes it in some browsers).
  const handleSelectGeminiModel = useCallback((model) => {
    setGeminiModel(model);
    if (model) {
      localStorage.setItem('gemini_model', model);
    } else {
      localStorage.removeItem('gemini_model');
    }
  }, []);

  // Every model picker on the page shows and changes this one choice.
  const geminiModelPicker = {
    value: geminiModel,
    models: geminiModels.models,
    defaultModel: geminiModels.defaultModel,
    onChange: handleSelectGeminiModel,
  };

  // Choosing a Gemini model in the image box also makes Gemini read images.
  const handleSelectImageReader = useCallback(
    (value) => {
      const local = value === LOCAL_READER;
      setReadsLocally(local);
      if (local) {
        localStorage.setItem('image_reader', LOCAL_READER);
        return;
      }
      localStorage.removeItem('image_reader');
      setRecalibrating(false);
      handleSelectGeminiModel(value);
    },
    [handleSelectGeminiModel]
  );

  const imageModelPicker = {
    ...geminiModelPicker,
    value: readsLocally ? LOCAL_READER : geminiModel,
    onChange: handleSelectImageReader,
    extraOptions: LOCAL_READER_OPTIONS,
  };

  // Check backend health on initial load
  useEffect(() => {
    checkBackendHealth().then((res) => {
      setBackendOnline(res.ok);
    });
  }, []);

  // Counts analysis requests: an answer counts only if no newer request was
  // made, or a slow analysis of a position left behind would put its lines
  // and best-move arrow on the position shown now.
  const analysisRequestRef = useRef(0);

  // Main Stockfish request function
  const triggerAnalysis = useCallback(
    async (fenToAnalyze, targetDepth = depth, targetMultipv = multipv) => {
      if (!fenToAnalyze || !fenToAnalyze.trim()) return;

      const request = ++analysisRequestRef.current;
      const isLatest = () => request === analysisRequestRef.current;
      setLoading(true);
      setError(null);
      setAnalysis(null);
      // Clear previous position's AI commentary
      setAiCommentary(null);
      setAiError(null);
      setEvalExplanation({ status: 'idle' });

      try {
        const data = await analyzeFen(fenToAnalyze, targetDepth, targetMultipv, chess960Ref.current);
        if (!isLatest()) return;
        setAnalysis(data);
        setBackendOnline(true);
      } catch (err) {
        if (isLatest()) setError(err.message || 'Analysis request failed');
      } finally {
        if (isLatest()) setLoading(false);
      }
    },
    [depth, multipv]
  );

  // Analyze the starting position once, on mount. Not on every new
  // triggerAnalysis: it changes with the depth and lines, and analyzing the
  // starting position then would replace the analysis of the board.
  useEffect(() => {
    triggerAnalysis(DEFAULT_FEN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Variation Preview state (for clicking moves in Stockfish engine lines)
  const [variationPreview, setVariationPreview] = useState(null);

  // Moves played on the board since a position was loaded, so the user can
  // step through them and get back to that position (see utils/moveLine).
  const [moveLine, setMoveLine] = useState(() => startLine(DEFAULT_FEN));

  // Shows a move of the line, or its start (-1), and analyzes it.
  const handleGoToLineMove = (index) => {
    const target = goTo(moveLine, index);
    const targetFen = shownFen(target);
    setMoveLine(target);
    setVariationPreview(null);
    loadGame(targetFen);
    showPosition(targetFen);
    playMoveSound(false);
    triggerAnalysis(targetFen);
  };

  // Handler for manual FEN update (e.g. typing or preset button)
  const handleFenChange = (newFen) => {
    setVariationPreview(null);
    showPosition(newFen);
    setError(null);
    // A half-typed FEN does not load; the board and list wait for a full one.
    if (loadGame(newFen)) {
      chess960Ref.current = false;
      setOrientation(sideToMove(newFen));
      setMoveLine(startLine(newFen));
    }
  };

  // Preview interactive moves from Stockfish PV
  const handlePreviewVariation = (lineRank, moves, stepIndex) => {
    try {
      const tempGame = new Chess(withStandardCastling(fen));
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
    // The engine moves become the user's moves, so they can be stepped back.
    const replay = new Chess(withStandardCastling(fen));
    let line = moveLine;
    for (let i = 0; i <= variationPreview.stepIndex; i++) {
      const move = replay.move(variationPreview.moves[i]);
      line = addMove(line, move.san, replay.fen());
    }
    setMoveLine(line);
    gameRef.current.load(targetFen);
    showPosition(targetFen);
    setVariationPreview(null);
    playMoveSound(false);
    triggerAnalysis(targetFen);
  };

  // Reset to Starting Position (Clears board, PGN, and inputs)
  const handleResetToStartingPosition = () => {
    setVariationPreview(null);
    chess960Ref.current = false;
    gameRef.current.load(DEFAULT_FEN);
    setFen(DEFAULT_FEN);
    setFenInput('');
    setPgnText('');
    setPgnMoves([]);
    setPgnHeaders({});
    setCurrentMoveIndex(-1);
    pgnFensRef.current = [DEFAULT_FEN];
    setMoveLine(startLine(DEFAULT_FEN));
    setOrientation('white');
    setImageRecognition({ status: 'idle' });
    setAiCommentary(null);
    setAiError(null);
    setEvalExplanation({ status: 'idle' });
    setError(null);
    playMoveSound(false);
    triggerAnalysis(DEFAULT_FEN);
  };

  // Handler for making a move via Drag & Drop on the board. For a promotion
  // the board asks which piece to take and passes it as `piece` ("wN").
  const handlePieceDrop = (sourceSquare, targetSquare, piece) => {
    setVariationPreview(null);
    const chosen = piece?.[1]?.toLowerCase();
    try {
      const move = gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'qrbn'.includes(chosen) ? chosen : 'q',
      });

      if (move === null) return false;

      playMoveSound(Boolean(move.captured));
      const newFen = gameRef.current.fen();
      showPosition(newFen);
      setMoveLine((prev) => addMove(prev, move.san, newFen));

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
        setMoveLine((prev) => addMove(prev, move.san, newFen));
        triggerAnalysis(newFen);
      }
    } catch (e) {
      setError(`Cannot execute move: ${e.message}`);
    }
  };

  // Puts a parsed game on the board at its final position. moves carry san,
  // color and before (the FEN before the move); fens are the start position
  // and the position after every move.
  const showLoadedGame = (headers, moves, fens, chess960) => {
    chess960Ref.current = chess960;
    pgnFensRef.current = fens;
    setPgnMoves(moves);
    setPgnHeaders(headers);
    setCurrentMoveIndex(moves.length - 1);

    const finalFen = fens[fens.length - 1];
    loadGame(finalFen);
    showPosition(finalFen);
    setOrientation(sideToMove(finalFen));
    setMoveLine(startLine(finalFen));
    triggerAnalysis(finalFen);
    setError(null);
  };

  // PGN Import & Parsing. chess.js has no Chess960, so those games are
  // replayed by the backend, castling included.
  const handleLoadPgn = async (pgnString) => {
    if (isChess960Pgn(pgnString)) {
      try {
        const res = await parsePgn(pgnString);
        if (!res.success) {
          setError(res.error || 'Failed to parse PGN');
          return;
        }
        showLoadedGame(res.headers, res.moves, res.fens, res.chess960);
      } catch (err) {
        setError(`Failed to parse PGN: ${err.message}`);
      }
      return;
    }

    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(withStandardCastlingPgn(pgnString));

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
      showLoadedGame(headers, history, fens, false);
    } catch (err) {
      setError(`Failed to parse PGN: ${err.message}`);
    }
  };

  // PGN Move Selection
  const handleSelectPgnMove = (index) => {
    if (index < -1 || index >= pgnMoves.length) return;
    setCurrentMoveIndex(index);
    const targetFen = pgnFensRef.current[index + 1] || DEFAULT_FEN;
    loadGame(targetFen);
    showPosition(targetFen);
    setMoveLine(startLine(targetFen));
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
    if (geminiWait > 0) return;

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
        model: geminiModel,
      });

      pauseGeminiAfter(res);
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

  // Asks Gemini why Stockfish rates the position as it does, sending the
  // engine's top lines along as evidence.
  const handleExplainEvaluation = async () => {
    if (!analysis || !analysis.lines || analysis.lines.length === 0) return;
    if (geminiWait > 0) return;

    const topChoice = analysis.lines[0];
    setEvalExplanation({ status: 'loading' });
    try {
      const res = await getAiCommentary({
        fen,
        turn: analysis.turn,
        score: topChoice.score,
        best_move_san: topChoice.move_san,
        explanation: topChoice.explanation,
        verbal_verdict: analysis.verbal_verdict,
        custom_api_key: customApiKey,
        model: geminiModel,
        focus: 'evaluation',
        lines: analysis.lines.map((line) => ({ score: line.score, pv_san: line.pv_san || [] })),
      });
      pauseGeminiAfter(res);
      setEvalExplanation(
        res.success
          ? { status: 'done', text: res.commentary }
          : { status: 'error', error: res.error || 'Failed to explain the evaluation' }
      );
    } catch (err) {
      setEvalExplanation({
        status: 'error',
        error: err.message || 'Error communicating with AI endpoint',
      });
    }
  };

  // Puts a position read from an image on the board and, when it is legal,
  // analyzes it; recognition holds what the box shows about it.
  const showRecognizedPosition = (recognition) => {
    setVariationPreview(null);
    chess960Ref.current = false;
    setError(null);
    try {
      gameRef.current.load(recognition.fen);
    } catch {
      // chess.js refuses an illegal position; the board stays locked until it is fixed.
    }
    showPosition(recognition.fen);
    setOrientation(sideToMove(recognition.fen));
    setMoveLine(startLine(recognition.fen));
    setImageRecognition({ status: 'done', ...recognition });

    if (recognition.isValid) {
      triggerAnalysis(recognition.fen);
    } else {
      // Stockfish would reject it; drop the analysis of the previous position.
      setAnalysis(null);
      setAiCommentary(null);
      setAiError(null);
      setEvalExplanation({ status: 'idle' });
    }
  };

  // Turns a position read upside down by 180 degrees; the backend turns a
  // board seen from Black's side itself, this is for when Gemini got it wrong.
  const handleRotateRecognized = () => {
    if (imageRecognition.status !== 'done') return;
    const fen = rotateFen(imageRecognition.fen);
    playMoveSound(false);
    showRecognizedPosition({
      ...imageRecognition,
      fen,
      isValid: getPositionError(fen) === null,
      seenFromBlack: !imageRecognition.seenFromBlack,
    });
  };

  // Teaches the local reader the board and pieces from a screenshot of the
  // starting position.
  const calibrateFrom = async (file) => {
    setImageRecognition({ status: 'recognizing', calibrating: true });
    try {
      const image_base64 = await readImageAsBase64(file);
      const res = await calibrateLocalReader({ image_base64, mime_type: file.type });
      if (!res.success) {
        setImageRecognition({
          status: 'error',
          error: res.error || 'Could not calibrate from this image',
        });
        return;
      }
      setLocalCalibrated(true);
      setRecalibrating(false);
      setImageRecognition({ status: 'calibrated', seenFromBlack: Boolean(res.seen_from_black) });
    } catch (err) {
      setImageRecognition({
        status: 'error',
        error: err.message || 'Could not calibrate from this image',
      });
    }
  };

  // Reads the position in an image with Gemini or the local reader and
  // shows it; while the local reader needs calibrating, calibrates it.
  const handleImageSelected = async (file) => {
    if (needsCalibration) {
      calibrateFrom(file);
      return;
    }
    setImageRecognition({ status: 'recognizing' });
    try {
      const image_base64 = await readImageAsBase64(file);
      const res = readsLocally
        ? await recognizeImage({ image_base64, mime_type: file.type, reader: LOCAL_READER })
        : await recognizeImage({
            image_base64,
            mime_type: file.type,
            custom_api_key: customApiKey,
            model: geminiModel,
          });
      if (readsLocally) {
        // The calibration may have gone missing on the backend.
        if (!res.success) refreshLocalReaderStatus();
      } else {
        pauseGeminiAfter(res);
      }
      if (!res.success) {
        setImageRecognition({
          status: 'error',
          error: res.error || 'Could not read the position from the image',
        });
        return;
      }

      showRecognizedPosition({
        fen: res.fen,
        turnDetected: res.turn_detected,
        isValid: res.is_valid,
        seenFromBlack: Boolean(res.seen_from_black),
      });
    } catch (err) {
      setImageRecognition({
        status: 'error',
        error: err.message || 'Could not read the position from the image',
      });
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

  // Keyboard navigation: through the game on the PGN tab, through the
  // user's own moves on the FEN tab.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const step = e.key === 'ArrowLeft' ? -1 : 1;

      if (activeTab === 'pgn' && pgnMoves.length > 0) {
        e.preventDefault();
        if (step < 0) handlePrevMove();
        else handleNextMove();
      } else if (activeTab === 'fen' && moveLine.moves.length > 0) {
        const index = moveLine.index + step;
        if (index < -1 || index >= moveLine.moves.length) return;
        e.preventDefault();
        handleGoToLineMove(index);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, pgnMoves, currentMoveIndex, moveLine]);

  const bestMove = analysis?.lines?.[0]?.move_uci || null;
  const isGameOver = analysis?.is_checkmate || analysis?.is_stalemate || false;
  // An illegal position read from an image is shown, but cannot be played on.
  const isIllegalImagePosition =
    imageRecognition.status === 'done' && !imageRecognition.isValid && imageRecognition.fen === fen;

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

          <ModelPicker {...geminiModelPicker} />

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
              chess960Ref.current = false;
              // The editor only lets a legal position through, so chess.js takes it.
              gameRef.current.load(newFen);
              showPosition(newFen);
              setOrientation(sideToMove(newFen));
              setMoveLine(startLine(newFen));
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
                <>
                  <FenInput
                    fen={fenInput}
                    onFenChange={handleFenChange}
                    depth={depth}
                    multipv={multipv}
                    onAnalyze={(newDepth, newMultipv) => {
                      setDepth(newDepth);
                      setMultipv(newMultipv);
                      triggerAnalysis(fen, newDepth, newMultipv);
                    }}
                    loading={loading}
                  />
                  <ImageImport
                    onImage={handleImageSelected}
                    recognition={imageRecognition}
                    onEditInEditor={() => setActiveTab('editor')}
                    onClear={() => setImageRecognition({ status: 'idle' })}
                    onRotate={handleRotateRecognized}
                    waitSeconds={readsLocally ? 0 : geminiWait}
                    modelPicker={imageModelPicker}
                    localReader={
                      readsLocally
                        ? {
                            active: true,
                            needsCalibration,
                            calibrated: Boolean(localCalibrated),
                            onRecalibrate: () => {
                              setRecalibrating(true);
                              setImageRecognition({ status: 'idle' });
                            },
                            onCancelCalibration: () => setRecalibrating(false),
                          }
                        : undefined
                    }
                  />
                </>
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
                <MoveLine line={moveLine} onGoTo={handleGoToLineMove} />
                <BoardView
                  fen={variationPreview ? variationPreview.previewFen : fen}
                  bestMove={variationPreview ? null : bestMove}
                  turn={analysis?.turn}
                  orientation={orientation}
                  onFlip={() => setOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
                  onPieceDrop={handlePieceDrop}
                  onPlayBestMove={handlePlayBestMove}
                  isGameOver={isGameOver || Boolean(variationPreview) || isIllegalImagePosition}
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
                  aiWaitSeconds={geminiWait}
                  modelPicker={geminiModelPicker}
                  onExplainEvaluation={handleExplainEvaluation}
                  evalExplanation={evalExplanation}
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
