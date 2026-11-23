/**
 * Whether one of the guitar recordings is playing (ui/GuitarMenu), for the
 * notes that drift over the field while it does (ui/MusicNotes).
 */
let playing = false;
const listeners = new Set<() => void>();

export function setMusicPlaying(v: boolean) {
  if (playing === v) return;
  playing = v;
  listeners.forEach((l) => l());
}

export const isMusicPlaying = () => playing;

export function subscribeMusic(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
