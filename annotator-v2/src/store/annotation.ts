/**
 * Pure annotation types + data helpers. No Dexie imports — safe to
 * use from content scripts without instantiating a per-host database.
 * `store/db.ts` imports from here; it owns the Dexie instance and is
 * only imported from SW-side code.
 */

export interface Point {
  x: number;
  y: number;
}

export type AnnotationType = 'stroke' | 'note' | 'highlight';
export type PrivacyLevel = 'private' | 'open';
export type SyncStatus = 'pending' | 'synced';

/** Unified annotation — one table, one schema. Type-specific payload in `data`. */
export interface Annotation {
  id: string;
  url: string;
  type: AnnotationType;
  privacy: PrivacyLevel;
  syncStatus: SyncStatus;
  data: string;           // JSON blob — type-specific payload
  color: string;
  timestamp: number;      // creation time (ms)
  updatedAt: number;      // LWW clock (unix seconds)
  deletedAt?: number;
  pageTitle: string;
  favicon: string;
  pageSection?: string;
  userId?: string;
  tags?: string[];
}

/** Input type — sync fields injected automatically, not required from callers. */
export type AnnotationInput = Omit<Annotation, 'privacy' | 'syncStatus' | 'updatedAt' | 'deletedAt' | 'userId'>;

export interface StrokeData {
  points: Point[];
  strokeWidth: number;
}

export interface NoteData {
  /** Plain-text fallback — kept in sync with lexicalState for search/export. */
  text: string;
  /** Lexical editor state JSON. Absent on pre-v7 notes; AnnotationCard treats it as a plain textarea in that case. */
  lexicalState?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pinned?: boolean;
  /** Optional highlight this note was spawned from. */
  linkedHighlightId?: string;
  /** Marks a Handoff/cross-extension note rendered as a bottom-of-viewport bar. */
  handoff?: boolean;
  /** Set once the user drags a handoff bar — switches from auto-center to explicit x/y. */
  handoffMoved?: boolean;
}

export interface HighlightData {
  serializedRange: string;
}

export function getStrokeData(ann: Annotation): StrokeData {
  return JSON.parse(ann.data);
}

export function getNoteData(ann: Annotation): NoteData {
  return JSON.parse(ann.data);
}

export function getHighlightData(ann: Annotation): HighlightData {
  return JSON.parse(ann.data);
}
