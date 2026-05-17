'use client';

import { create } from 'zustand';

interface CommandPaletteStore {
  open: boolean;
  search: string;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSearch: (search: string) => void;
}

export const useCommandPalette = create<CommandPaletteStore>((set) => ({
  open: false,
  search: '',
  setOpen: (open) => set((state) => ({
    open: typeof open === 'function' ? open(state.open) : open,
    search: '',
  })),
  setSearch: (search) => set({ search }),
}));
