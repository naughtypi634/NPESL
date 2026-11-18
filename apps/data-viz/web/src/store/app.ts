import { create } from 'zustand';

import { loadGallery, loadLibrary, loadTopic } from '../data/loader';
import type {
  ChartOptions,
  Gallery,
  Level,
  Library,
  Register,
  Tab,
  Topic,
  ViewData,
} from '../data/types';

interface AppState {
  gallery: Gallery | null;
  galleryError: string | null;
  topics: Record<string, Topic>;
  topicLoading: Record<string, boolean>;
  topicErrors: Record<string, string>;
  libraries: Record<string, Library>;
  libraryLoading: Record<string, boolean>;
  mark: string | null;
  tab: Tab;
  register: Register;
  level: Level;
  options: ChartOptions;
  edits: Record<string, ViewData>;
  loadGallery: () => Promise<void>;
  ensureTopic: (slug: string) => Promise<Topic | null>;
  ensureLibrary: (type: string) => Promise<Library | null>;
  setMark: (mark: string | null) => void;
  setTab: (tab: Tab) => void;
  setRegister: (register: Register) => void;
  setLevel: (level: Level) => void;
  setOption: <K extends keyof ChartOptions>(key: K, value: ChartOptions[K]) => void;
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
  mark: null,
  tab: 'observe',
  register: 'general',
  level: 'b1',
  options: { smooth: true, labels: true, sort: 'none', percent: false },
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

  setMark: (mark) => set({ mark }),
  setTab: (tab) => set({ tab }),
  setRegister: (register) => set({ register }),
  setLevel: (level) => set({ level }),
  setOption: (key, value) =>
    set({ options: { ...get().options, [key]: value } }),
  editData: (key, data) => set({ edits: { ...get().edits, [key]: data } }),
  resetEdits: (key) => {
    const edits = { ...get().edits };
    delete edits[key];
    set({ edits });
  },
}));
