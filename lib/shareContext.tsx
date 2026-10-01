'use client';
import { createContext, useContext } from 'react';

// Marks "this render tree is the public /share/[token] CMS view, not the
// logged-in /media app" for every component the two routes have in common
// (ContentBoard, MediaTabBar, ContentItemCard, ContentTable, CalendarView,
// IdeasTab, and the data hooks useContentItems/useContentIdeas). Those
// components stay the exact same ones the internal app renders -- they just
// check this context to know to fetch/patch through the share-scoped API
// instead of the internal one, and to hide anything a public link holder
// must never reach (creating more shares, adding/deleting items, Zernio
// scheduling, the internal item-detail page).
export interface ShareCtx {
  token: string;
}

export const ShareContext = createContext<ShareCtx | null>(null);

// Returns null when rendered inside the normal logged-in app -- every
// consumer uses that to fall back to its original internal behaviour
// unchanged.
export function useShareContext(): ShareCtx | null {
  return useContext(ShareContext);
}
