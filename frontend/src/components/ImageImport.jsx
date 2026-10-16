import React, { useEffect, useRef, useState } from 'react';
import { IMAGE_TYPES, getImageFileError } from '../utils/imageFile';
import { formatCountdown } from '../hooks/useGeminiCooldown';
import ModelPicker from './ModelPicker';

const PASTE_HINT = 'press Ctrl+V / ⌘V to paste the image instead';

/**
 * Takes a picture of a chess position: pasted from the clipboard, chosen as
 * a file or dropped onto the box. It only collects the image and shows the
 * state of the recognition; App sends the image to the backend.
 *
 * recognition: { status: 'idle' | 'recognizing' | 'done' | 'calibrated' | 'error',
 *                error, fen, turnDetected, isValid, seenFromBlack, calibrating }
 * onRotate:    turns a result by 180 degrees, for a board read upside down
 * waitSeconds: how long Gemini asked to wait before the next request; Try
 *              Again stays locked until it runs out.
 * modelPicker: props for a ModelPicker always shown in the box: another model
 *              may read a picture better, and has its own quota.
 * localReader: { active, needsCalibration, calibrated, onRecalibrate,
 *              onCancelCalibration } when the local reader is chosen. While it
 *              needs calibration, the next image is taken as the starting
 *              position to learn the board and pieces from.
 */
export default function ImageImport({
  onImage,
  recognition,
  onEditInEditor,
  onClear,
  onRotate,
  waitSeconds = 0,
  modelPicker,
  localReader,
}) {
  // Object URL of the last image, shown as a thumbnail next to the result.
  const [previewUrl, setPreviewUrl] = useState(null);
  // The last image sent, kept so a failed recognition can be tried again.
  const [lastImage, setLastImage] = useState(null);
  // Problems found before anything is sent: wrong file type, empty clipboard.
  const [localError, setLocalError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const recognizing = recognition.status === 'recognizing';

  const handleImage = (file) => {
    if (recognizing) return;
    const fileError = getImageFileError(file);
    if (fileError) {
      setLocalError(fileError);
      return;
    }
    setLocalError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setLastImage(file);
    onImage(file);
  };

  // Sends the same image again: after Gemini was overloaded, or with another
  // model after a misread.
  const handleRetry = () => {
    if (recognizing || !lastImage || waitSeconds > 0) return;
    onImage(lastImage);
  };

  // Free a thumbnail once it is replaced or the component goes away.
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  // Ctrl+V / ⌘V anywhere on the page. Text pastes (a FEN into the box)
  // carry no image file and are left alone.
  useEffect(() => {
    const handlePaste = (e) => {
      const image = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (!image) return;
      e.preventDefault();
      handleImage(image);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // No dependency list: re-subscribe after every render so the handler
    // always sees the current state (e.g. whether recognition is running).
  });

  // The button reads the clipboard through the async Clipboard API, which
  // not every browser allows; the keyboard paste above works everywhere.
  const handlePasteButton = async () => {
    if (!navigator.clipboard?.read) {
      setLocalError(`This browser cannot read images from the clipboard here — ${PASTE_HINT}.`);
      return;
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          handleImage(await item.getType(type));
          return;
        }
      }
      setLocalError('The clipboard has no image. Copy a screenshot of the board first.');
    } catch {
      setLocalError(`Clipboard access was denied — ${PASTE_HINT}.`);
    }
  };

  const handleFileChosen = (e) => {
    const file = e.target.files?.[0];
    // Clear the input so choosing the same file again still fires a change.
    e.target.value = '';
    if (file) handleImage(file);
  };

  // Forgets the image and any error or result; the board stays as it is.
  const handleClear = () => {
    setPreviewUrl(null);
    setLastImage(null);
    setLocalError(null);
    onClear();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImage(file);
  };

  const error = localError || (recognition.status === 'error' ? recognition.error : null);
  const sideToMove = recognition.fen?.split(' ')[1] === 'b' ? 'Black' : 'White';
  // Offered after a failure and after a result, which may be a misread.
  const canRetry =
    !localError &&
    Boolean(lastImage) &&
    (recognition.status === 'error' || recognition.status === 'done');
  // Shown under a result: a board read upside down has pawns about to
  // promote on both sides and kings far from home, which one click undoes.
  const rotateButton = onRotate && (
    <button
      type="button"
      className="preset-btn"
      onClick={onRotate}
      title="The board came out upside down: turn the position by 180 degrees"
    >
      ↻ Upside down? Turn 180°
    </button>
  );
  const seenFromBlackNote = ' The picture shows the board from Black\'s side; it was turned to White\'s.';
  const hasSomethingToClear = Boolean(previewUrl || localError || recognition.status !== 'idle');
  const calibrating = Boolean(localReader?.active && localReader.needsCalibration);

  return (
    <div className="card image-import-card">
      <span className="form-label">Position from Image</span>

      <div
        className={`image-drop-zone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        data-testid="image-drop-zone"
      >
        {previewUrl && (
          <img className="image-preview" src={previewUrl} alt="Imported chess position" />
        )}

        <div className="image-drop-body">
          {calibrating && (
            <div className="calibration-note">
              <span>
                🎯 <strong>Calibrate the local reader:</strong> paste or upload a screenshot of the{' '}
                <strong>starting position</strong>, taken on the site your screenshots come from.
                Either side may be at the bottom. From it the reader learns that site&apos;s board
                and pieces.
              </span>
              {localReader.calibrated && (
                <button
                  type="button"
                  className="preset-btn"
                  onClick={localReader.onCancelCalibration}
                  disabled={recognizing}
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          <p className="image-drop-text">
            Paste a screenshot of a board with <kbd>Ctrl</kbd>+<kbd>V</kbd> / <kbd>⌘</kbd>+
            <kbd>V</kbd>, drop an image here, or:
          </p>
          <div className="presets-buttons">
            <button
              type="button"
              className="preset-btn"
              onClick={handlePasteButton}
              disabled={recognizing}
            >
              📋 Paste Image
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={recognizing}
            >
              📁 Upload File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_TYPES.join(',')}
              onChange={handleFileChosen}
              aria-label="Upload image file"
              hidden
            />
            {hasSomethingToClear && (
              <button
                type="button"
                className="preset-btn btn-danger-text"
                onClick={handleClear}
                disabled={recognizing}
              >
                Clear Image
              </button>
            )}
          </div>

          {/* Always here, so the model can be chosen before the first read and
              changed for another try. On its own line, so nothing around it
              moves an open dropdown. */}
          {modelPicker && (
            <div className="image-model-row">
              <ModelPicker
                {...modelPicker}
                label="Model"
                ariaLabel="Switch Gemini model for reading images"
                className="model-picker-inline"
              />
              {localReader?.active && !calibrating && (
                <button
                  type="button"
                  className="preset-btn"
                  onClick={localReader.onRecalibrate}
                  disabled={recognizing}
                  title="Teach the local reader another board style from a screenshot of the starting position"
                >
                  🎯 Recalibrate
                </button>
              )}
            </div>
          )}

          {recognizing && (
            <p className="image-status">
              <span className="spinner"></span>{' '}
              {recognition.calibrating
                ? 'Learning the board and pieces from the starting position...'
                : 'Reading the position from the image...'}
            </p>
          )}

          {!localError && recognition.status === 'calibrated' && (
            <div className="image-result">
              <span>
                ✅ Calibrated. The local reader now reads screenshots of this board style: paste
                one of any position.
                {recognition.seenFromBlack && ' (The starting position was seen from Black\'s side.)'}
              </span>
            </div>
          )}

          {error && <div className="image-error">⚠️ {error}</div>}

          {!localError && recognition.status === 'done' && recognition.isValid && (
            <div className="image-result">
              <span>
                ✅ Position recognized. <strong>{sideToMove} to move</strong>
                {recognition.turnDetected
                  ? ' (shown in the image).'
                  : ' — a guess, the image does not show it.'}
                {recognition.seenFromBlack && seenFromBlackNote}
              </span>
              <button type="button" className="preset-btn" onClick={onEditInEditor}>
                🧩 Fix in Board Editor
              </button>
              {rotateButton}
            </div>
          )}

          {!localError && recognition.status === 'done' && !recognition.isValid && (
            <div className="editor-warn-box image-result">
              <span>
                ⚠️ The recognized position is not legal, probably a misread piece. Fix it in
                the Board Editor before analysis.
                {recognition.seenFromBlack && seenFromBlackNote}
              </span>
              <button type="button" className="preset-btn" onClick={onEditInEditor}>
                🧩 Fix in Board Editor
              </button>
              {rotateButton}
            </div>
          )}

          {canRetry && (
            <div className="presets-buttons">
              <button
                type="button"
                className="preset-btn"
                onClick={handleRetry}
                disabled={waitSeconds > 0}
                title="Send the same image again, to the model chosen above"
              >
                {recognition.status === 'done' ? '🔁 Read Again' : '🔁 Try Again'}
              </button>
              {waitSeconds > 0 && (
                <span className="gemini-wait" role="timer">
                  ⏳ Gemini asked to wait {formatCountdown(waitSeconds)}
                  {modelPicker ? ' — or choose another model above' : ' — or choose another model at the top'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
