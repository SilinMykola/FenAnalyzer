import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ImageImport from './ImageImport';

const IDLE = { status: 'idle' };

function imageFile(name = 'board.png', type = 'image/png') {
  return new File(['fake image bytes'], name, { type });
}

function renderImport(recognition = IDLE) {
  const callbacks = { onImage: vi.fn(), onEditInEditor: vi.fn(), onClear: vi.fn() };
  const utils = render(<ImageImport recognition={recognition} {...callbacks} />);
  const rerender = (next) => utils.rerender(<ImageImport recognition={next} {...callbacks} />);
  return { ...utils, ...callbacks, rerender };
}

const fileInput = () => screen.getByLabelText('Upload image file');
const pasteButton = () => screen.getByRole('button', { name: /Paste Image/ });
const clearButton = () => screen.queryByRole('button', { name: /Clear Image/ });

// What navigator.clipboard.read() returns: items that list their types.
function clipboardItem(type, blob) {
  return { types: [type], getType: vi.fn().mockResolvedValue(blob) };
}

describe('ImageImport choosing a file', () => {
  it('passes a chosen image on and shows it as a thumbnail', async () => {
    const user = userEvent.setup();
    const { onImage } = renderImport();
    const file = imageFile();

    await user.upload(fileInput(), file);

    expect(onImage).toHaveBeenCalledWith(file);
    expect(screen.getByAltText('Imported chess position')).toHaveAttribute(
      'src',
      'blob:test-preview'
    );
  });

  it('lets the same file be chosen again', async () => {
    const user = userEvent.setup();
    const { onImage } = renderImport();
    const file = imageFile();

    await user.upload(fileInput(), file);

    // A file input fires "change" only when its value changes, so the
    // component empties it after every pick.
    expect(fileInput()).toHaveValue('');
    expect(onImage).toHaveBeenCalledTimes(1);
  });

  it('opens the file picker from the Upload File button', async () => {
    const user = userEvent.setup();
    renderImport();
    const click = vi.spyOn(fileInput(), 'click');

    await user.click(screen.getByRole('button', { name: /Upload File/ }));

    expect(click).toHaveBeenCalled();
  });

  it('accepts only the image types the backend can read', () => {
    renderImport();

    expect(fileInput()).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
  });

  it('refuses a file of another type', () => {
    const { onImage } = renderImport();

    // fireEvent bypasses the accept filter, as dropping a file would.
    fireEvent.change(fileInput(), { target: { files: [imageFile('anim.gif', 'image/gif')] } });

    expect(onImage).not.toHaveBeenCalled();
    expect(screen.getByText('⚠️ Use a PNG, JPEG or WebP image.')).toBeInTheDocument();
  });

  it('refuses an image over 10 MB', () => {
    const { onImage } = renderImport();
    const big = imageFile();
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });

    fireEvent.change(fileInput(), { target: { files: [big] } });

    expect(onImage).not.toHaveBeenCalled();
    expect(screen.getByText('⚠️ The image is larger than 10 MB.')).toBeInTheDocument();
  });

  it('clears an earlier error once a good image arrives', () => {
    renderImport();
    fireEvent.change(fileInput(), { target: { files: [imageFile('a.gif', 'image/gif')] } });

    fireEvent.change(fileInput(), { target: { files: [imageFile()] } });

    expect(screen.queryByText(/Use a PNG/)).not.toBeInTheDocument();
  });

  it('takes an image dropped onto the box', () => {
    const { onImage } = renderImport();
    const zone = screen.getByTestId('image-drop-zone');
    const file = imageFile();

    fireEvent.dragOver(zone);
    expect(zone).toHaveClass('drag-over');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onImage).toHaveBeenCalledWith(file);
    expect(zone).not.toHaveClass('drag-over');
  });

  it('frees the previous thumbnail when a new image arrives', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    const { unmount } = renderImport();

    fireEvent.change(fileInput(), { target: { files: [imageFile()] } });
    fireEvent.change(fileInput(), { target: { files: [imageFile()] } });
    expect(revoke).toHaveBeenCalledWith('blob:first');

    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:second');
  });
});

describe('ImageImport pasting', () => {
  it('takes an image pasted with Ctrl+V / ⌘V anywhere on the page', () => {
    const { onImage } = renderImport();
    const file = imageFile();

    const notCancelled = fireEvent.paste(window, { clipboardData: { files: [file] } });

    expect(onImage).toHaveBeenCalledWith(file);
    // The browser's own paste is cancelled, so nothing lands in a focused field.
    expect(notCancelled).toBe(false);
  });

  it('leaves a text paste alone, such as a FEN typed into the box', () => {
    const { onImage } = renderImport();

    const notCancelled = fireEvent.paste(window, { clipboardData: { files: [] } });

    expect(onImage).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });

  it('reads an image from the clipboard with the Paste Image button', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['png'], { type: 'image/png' });
    vi.spyOn(navigator.clipboard, 'read').mockResolvedValue([
      clipboardItem('text/plain', new Blob(['x'])),
      clipboardItem('image/png', blob),
    ]);
    const { onImage } = renderImport();

    await user.click(pasteButton());

    expect(onImage).toHaveBeenCalledWith(blob);
  });

  it('says so when the clipboard holds no image', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'read').mockResolvedValue([
      clipboardItem('text/plain', new Blob(['rnbqkbnr/...'])),
    ]);
    const { onImage } = renderImport();

    await user.click(pasteButton());

    expect(onImage).not.toHaveBeenCalled();
    expect(screen.getByText(/The clipboard has no image/)).toBeInTheDocument();
  });

  it('suggests the keyboard when clipboard access is denied', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'read').mockRejectedValue(new DOMException('denied'));
    renderImport();

    await user.click(pasteButton());

    expect(screen.getByText(/Clipboard access was denied — press Ctrl\+V/)).toBeInTheDocument();
  });

  it('suggests the keyboard when the browser cannot read clipboard images', () => {
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ readText: vi.fn() });
    renderImport();

    fireEvent.click(pasteButton());

    expect(screen.getByText(/cannot read images from the clipboard/)).toBeInTheDocument();
  });
});

describe('ImageImport recognition state', () => {
  it('shows progress and takes no new image while recognizing', () => {
    const { onImage } = renderImport({ status: 'recognizing' });

    expect(screen.getByText(/Reading the position from the image/)).toBeInTheDocument();
    expect(pasteButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: /Upload File/ })).toBeDisabled();

    fireEvent.paste(window, { clipboardData: { files: [imageFile()] } });
    expect(onImage).not.toHaveBeenCalled();
  });

  it('shows a recognition error', () => {
    renderImport({ status: 'error', error: 'No chess board was found in the image.' });

    expect(screen.getByText('⚠️ No chess board was found in the image.')).toBeInTheDocument();
  });

  it('confirms the position and the side to move read from the image', () => {
    renderImport({
      status: 'done',
      fen: '4k3/8/8/8/8/8/8/4K3 b - - 0 1',
      turnDetected: true,
      isValid: true,
    });

    expect(screen.getByText(/Position recognized/)).toHaveTextContent(
      'Black to move (shown in the image).'
    );
  });

  it('warns that the side to move is a guess when the image does not show it', () => {
    renderImport({
      status: 'done',
      fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
      turnDetected: false,
      isValid: true,
    });

    expect(screen.getByText(/Position recognized/)).toHaveTextContent(
      'White to move — a guess, the image does not show it.'
    );
  });

  it('offers the board editor to fix a misread piece', async () => {
    const user = userEvent.setup();
    const { onEditInEditor } = renderImport({
      status: 'done',
      fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
      turnDetected: false,
      isValid: true,
    });

    await user.click(screen.getByRole('button', { name: /Fix in Board Editor/ }));

    expect(onEditInEditor).toHaveBeenCalledTimes(1);
  });

  it('warns about an illegal position and points to the board editor', async () => {
    const user = userEvent.setup();
    const { onEditInEditor } = renderImport({
      status: 'done',
      fen: '8/8/8/8/8/8/8/4K3 w - - 0 1',
      turnDetected: false,
      isValid: false,
    });

    expect(screen.getByText(/recognized position is not legal/)).toBeInTheDocument();
    expect(screen.queryByText(/Position recognized/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Fix in Board Editor/ }));
    expect(onEditInEditor).toHaveBeenCalledTimes(1);
  });

  it('shows nothing extra before any image is given', () => {
    renderImport(IDLE);

    expect(screen.queryByText(/Position recognized|not legal|⚠️|Reading/)).not.toBeInTheDocument();
  });
});

describe('ImageImport clearing', () => {
  it('has nothing to clear before an image is given', () => {
    renderImport(IDLE);

    expect(clearButton()).not.toBeInTheDocument();
  });

  it('removes the image and tells App to forget the result', async () => {
    const user = userEvent.setup();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { onClear, rerender } = renderImport();
    fireEvent.change(fileInput(), { target: { files: [imageFile()] } });
    rerender({ status: 'error', error: 'Gemini did not answer within 120 seconds.' });

    await user.click(clearButton());

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText('Imported chess position')).not.toBeInTheDocument();
    expect(revoke).toHaveBeenCalledWith('blob:test-preview');
  });

  it('removes an error about a refused file', async () => {
    const user = userEvent.setup();
    renderImport();
    fireEvent.change(fileInput(), { target: { files: [imageFile('a.gif', 'image/gif')] } });

    await user.click(clearButton());

    expect(screen.queryByText(/Use a PNG/)).not.toBeInTheDocument();
  });

  it('can clear a result left from an earlier image', () => {
    // App still holds the result, e.g. after switching tabs, while the
    // component no longer has the thumbnail.
    renderImport({ status: 'error', error: 'No chess board was found in the image.' });

    expect(clearButton()).toBeEnabled();
  });

  it('cannot clear while the image is being read', () => {
    renderImport({ status: 'recognizing' });

    expect(clearButton()).toBeDisabled();
  });
});

describe('ImageImport trying again', () => {
  const retryButton = () => screen.queryByRole('button', { name: /Try Again/ });
  const OVERLOADED = { status: 'error', error: 'Gemini servers are temporarily overloaded.' };

  it('sends the same image again after a failed recognition', async () => {
    const user = userEvent.setup();
    const { onImage, rerender } = renderImport();
    const file = imageFile();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    rerender(OVERLOADED);

    await user.click(retryButton());

    expect(onImage).toHaveBeenCalledTimes(2);
    // File objects all look equal to a deep comparison, so check identity.
    expect(onImage.mock.lastCall[0]).toBe(file);
    // The thumbnail stays: it is still the same image.
    expect(screen.getByAltText('Imported chess position')).toBeInTheDocument();
  });

  it('sends the latest image when several were given', async () => {
    const user = userEvent.setup();
    const { onImage, rerender } = renderImport();
    const second = imageFile('second.png');
    fireEvent.change(fileInput(), { target: { files: [imageFile('first.png')] } });
    fireEvent.change(fileInput(), { target: { files: [second] } });
    rerender(OVERLOADED);

    await user.click(retryButton());

    expect(onImage.mock.lastCall[0]).toBe(second);
  });

  it('is not offered before an image is sent', () => {
    // An error App still holds from an image this component no longer has.
    renderImport(OVERLOADED);

    expect(retryButton()).not.toBeInTheDocument();
  });

  it('is not offered while the image is being read or once it is read', () => {
    const { rerender } = renderImport();
    fireEvent.change(fileInput(), { target: { files: [imageFile()] } });

    rerender({ status: 'recognizing' });
    expect(retryButton()).not.toBeInTheDocument();

    rerender({ status: 'done', fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', isValid: true });
    expect(retryButton()).not.toBeInTheDocument();
  });

  it('is not offered for a file refused before sending', () => {
    const { rerender } = renderImport();
    fireEvent.change(fileInput(), { target: { files: [imageFile()] } });
    rerender(OVERLOADED);

    fireEvent.change(fileInput(), { target: { files: [imageFile('a.gif', 'image/gif')] } });

    expect(retryButton()).not.toBeInTheDocument();
  });

  it('is gone once the image is cleared', async () => {
    const user = userEvent.setup();
    const { rerender } = renderImport();
    fireEvent.change(fileInput(), { target: { files: [imageFile()] } });
    rerender(OVERLOADED);

    await user.click(clearButton());
    rerender(OVERLOADED);

    expect(retryButton()).not.toBeInTheDocument();
  });
});
