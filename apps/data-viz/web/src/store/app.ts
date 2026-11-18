import { create } from 'zustand';

import { loadGallery, loadLibrary, loadTopic } from '../data/loader';
import type { Gallery, Library, Topic, ViewData } from '../data/types';

interface AppState {
  gallery: Gallery | null;
  galleryError: string | null;
  topics: Record<string, Topic>;
  topicLoading: Record<string, boolean>;
  topicErrors: Record<string, string>;
  libraries: Record<string, Library>;
  libraryLoading: Record<string, boolean>;
  edits: Record<string, ViewData>;
  loadGallery: () => Promise<void>;
  ensureTopic: (slug: string) => Promise<Topic | null>;
  ensureLibrary: (type: string) => Promise<Library | null>;
  editData: (key: string, data: ViewData) => void;
  resetEdits: (key: string) => void;
}

export function editKey(slug: string, viewId: string): string {
  return `${slug}/${viewId}`;
}

export const useApp = create<AppState>((set, get) => ({
  gallery: null,
  galleryError: null,
  topics: {},
  topicLoading: {},
  topicErrors: {},
  libraries: {},
  libraryLoading: {},
  edits: {},

  loadGallery: async () => {
    if (get().gallery || get().galleryError) return;
    try {
      const gallery = await loadGallery();
      set({ gallery });
    } catch (error) {
      set({ galleryError: error instanceof Error ? error.message : String(error) });
    }
  },

  ensureTopic: async (slug) => {
    const state = get();
    const cached = state.topics[slug];
    if (cached) return cached;
    if (!state.gallery) return null;
    set({
      topicLoading: { ...state.topicLoading, [slug]: true },
      topicErrors: { ...state.topicErrors, [slug]: '' },
    });
    try {
      const topic = await loadTopic(state.gallery, slug);
      set({
        topics: { ...get().topics, [slug]: topic },
        topicLoading: { ...get().topicLoading, [slug]: false },
      });
      return topic;
    } catch (error) {
      set({
        topicLoading: { ...get().topicLoading, [slug]: false },
        topicErrors: {
          ...get().topicErrors,
          [slug]: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  },

  ensureLibrary: async (type) => {
    const state = get();
    const cached = state.libraries[type];
    if (cached) return cached;
    if (!state.gallery) return null;
    if (state.libraryLoading[type]) return null;
    set({ libraryLoading: { ...state.libraryLoading, [type]: true } });
    try {
      const library = await loadLibrary(state.gallery, type);
      set({
        libraries: { ...get().libraries, [type]: library },
        libraryLoading: { ...get().libraryLoading, [type]: false },
      });
      return library;
    } catch {
      set({ libraryLoading: { ...get().libraryLoading, [type]: false } });
      return null;
    }
  },

  editData: (key, data) => set({ edits: { ...get().edits, [key]: data } }),
  resetEdits: (key) => {
    const edits = { ...get().edits };
    delete edits[key];
    set({ edits });
  },
}));
