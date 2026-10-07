import React from 'react';

// react-chessboard draws the board with drag-and-drop machinery that jsdom
// cannot drive. Tests swap it for this stub, which only remembers the props
// it was rendered with, so a test can read them (position, arrows,
// orientation) and call the handlers (onPieceDrop, onSquareClick) directly,
// as if the user had dropped a piece or clicked a square.
//
// Usage in a test file:
//   vi.mock('react-chessboard', () => import('../test/mockChessboard'));
//   ...
//   act(() => chessboardProps().onSquareClick('e4'));

let lastProps = null;

export function chessboardProps() {
  return lastProps;
}

export function Chessboard(props) {
  lastProps = props;
  return <div data-testid="chessboard" data-orientation={props.boardOrientation} />;
}
