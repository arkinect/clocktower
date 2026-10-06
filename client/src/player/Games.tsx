// Night idle games. The choice is a per-device convenience kept in localStorage.
// FlapGame.tsx ("Night Flight") is kept in the codebase but no longer offered (owner request).
import { useState } from 'react';
import { SliceGame } from './MiniGame';
import { Game2048 } from './Game2048';

type Game = 'slice' | '2048';
const KEY = 'ct_night_game';

function load(): Game {
  try { return localStorage.getItem(KEY) === '2048' ? '2048' : 'slice'; } catch { return 'slice'; }
}

export function NightGames() {
  const [game, setGame] = useState<Game>(load);
  const pick = (g: Game) => {
    setGame(g);
    try { localStorage.setItem(KEY, g); } catch { /* private mode */ }
  };
  return (
    <div className="games">
      <div className="gamepick">
        <button className={game === 'slice' ? 'on' : ''} onClick={() => pick('slice')}>Lantern Slice</button>
        <button className={game === '2048' ? 'on' : ''} onClick={() => pick('2048')}>2048</button>
      </div>
      {game === 'slice' ? <SliceGame key="slice" /> : <Game2048 key="2048" />}
    </div>
  );
}
