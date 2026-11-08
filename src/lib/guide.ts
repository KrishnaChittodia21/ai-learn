// App-wide "guide" UI state: the welcome tour, the page guide panel, a running walkthrough and the command palette.
import { useSyncExternalStore } from 'react';
import type { GuideId } from './pageGuides';

interface GuideState {
  tour: boolean;
  /** the "Guide · this page" panel */
  page: boolean;
  /** the running spotlight walkthrough */
  walk: GuideId | null;
  palette: boolean;
}

let state: GuideState = { tour: false, page: false, walk: null, palette: false };
const listeners = new Set<() => void>();

function set(patch: Partial<GuideState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const openTour = () => set({ tour: true, page: false, walk: null, palette: false });
export const closeTour = () => set({ tour: false });
export const openPageGuide = () => set({ page: true, palette: false });
export const closePageGuide = () => set({ page: false });
export const startWalk = (id: GuideId) => set({ walk: id, page: false, tour: false, palette: false });
export const endWalk = () => set({ walk: null });
export const openPalette = () => set({ palette: true });
export const closePalette = () => set({ palette: false });

/** Anything modal open (keyboard shortcuts and the first-visit offer wait for it to close). */
export const guideBusy = (g: GuideState) => g.tour || g.page || !!g.walk || g.palette;

export function useGuide(): GuideState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
