// Night idle games, in their own chunk. The choice is a per-device convenience kept in localStorage.
import { useState } from 'react';
import { Game2048 } from './Game2048';
import { SliceGame } from './MiniGame';
import './games.css';

type Game = 'slice' | '2048';
const KEY = 'ct_night_game';

function load(): Game {
  try {
    return localStorage.getItem(KEY) === '2048' ? '2048' : 'slice';
  } catch {
    return 'slice';
  }
}

export default function NightGames({ owner }: { owner: string }) {
  const [game, setGame] = useState<Game>(load);
  const pick = (g: Game) => {
    setGame(g);
    try {
      localStorage.setItem(KEY, g);
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="games">
      <div className="gamepick">
        <button type="button" className={game === 'slice' ? 'on' : ''} onClick={() => pick('slice')}>
          Lantern Slice
        </button>
        <button type="button" className={game === '2048' ? 'on' : ''} onClick={() => pick('2048')}>
          2048
        </button>
      </div>
      {game === 'slice' ? <SliceGame key="slice" /> : <Game2048 key="2048" owner={owner} />}
    </div>
  );
}
