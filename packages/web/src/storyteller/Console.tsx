import type { StorytellerView } from '@ct/protocol';

export default function Console({ view }: { view: StorytellerView; tab: string | null }) {
  return <p className="pad">Storyteller console for {view.code}</p>;
}
