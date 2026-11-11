// Night idle games, in their own chunk. The choice is a per-device convenience kept in localStorage.
// Crazy 8s is the one game played against other phones, so it is the one that talks to the server.
import { useState } from 'react';
import { CrazyEights } from './CrazyEights';
import { Game2048 } from './Game2048';
import { SliceGame } from './MiniGame';
import './games.css';

type Game = 'slice' | '2048' | 'eights';
const GAMES: Game[] = ['slice', '2048', 'eights'];
const KEY = 'ct_night_game';

function load(): Game {
  try {
    return GAMES.find((g) => g === localStorage.getItem(KEY)) ?? 'slice';
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
        <button type="button" className={game === 'eights' ? 'on' : ''} onClick={() => pick('eights')}>
          Crazy 8s
        </button>
      </div>
      {game === 'slice' && <SliceGame key="slice" />}
      {game === '2048' && <Game2048 key="2048" owner={owner} />}
      {game === 'eights' && <CrazyEights key="eights" />}
    </div>
  );
}
