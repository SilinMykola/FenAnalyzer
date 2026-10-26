// Each file holds the texts of one part of the app, in all four languages:
// { en: { key: text }, de: {...}, ru: {...}, uk: {...} }. Keys start with
// the part's name, so files never clash. They are merged here by language.
import app from './app';
import analysis from './analysis';
import settings from './settings';
import moveLine from './moveLine';
import image from './image';
import modelPicker from './modelPicker';
import editor from './editor';
import board from './board';
import fen from './fen';
import pgn from './pgn';

const parts = [app, analysis, settings, moveLine, image, modelPicker, editor, board, fen, pgn];

const messages = {};
for (const part of parts) {
  for (const [language, texts] of Object.entries(part)) {
    messages[language] = { ...messages[language], ...texts };
  }
}

export { parts };
export default messages;
