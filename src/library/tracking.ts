import { App, TFile } from 'obsidian';
import { isInFolder, libraryPaths } from '../core/paths';
import { MEDIA_TYPES, MediaType } from '../media/types';
import type { WatchlistNotesSettings } from '../settings';

// Your own progress on a title, kept in the note's properties:
//   myStatus  Planned, Watching / Reading, Completed, On hold, or Dropped
//   progress  episodes or chapters done (not for movies)
//   rating    1–10, or N/A
//   finished  the date it was marked Completed
//   watched   true when Completed, so the 🟩 / 🟥 column and older notes keep working
// `status` is left alone: it's the source's airing or publishing status ("Finished Airing").

export const STATUS = {
	planned: 'Planned',
	watching: 'Watching',
	reading: 'Reading',
	completed: 'Completed',
	onHold: 'On hold',
	dropped: 'Dropped',
} as const;

export type WatchStatus = (typeof STATUS)[keyof typeof STATUS];

type Frontmatter = Record<string, unknown>;

/** The "in progress" word for a type: you read manga and watch everything else. */
export function activeStatus(type: MediaType): WatchStatus {
	return type === 'manga' ? STATUS.reading : STATUS.watching;
}

/** The statuses offered for a type, in the order the picker shows them. */
export function statusChoices(type: MediaType): WatchStatus[] {
	return [STATUS.planned, activeStatus(type), STATUS.completed, STATUS.onHold, STATUS.dropped];
}

/** Which type's folder a note is in, or null when it isn't in one. */
export function mediaTypeOf(file: TFile | null, settings: WatchlistNotesSettings): MediaType | null {
	if (!file || file.extension !== 'md') return null;
	const { folders } = libraryPaths(settings);
	return MEDIA_TYPES.find((type) => isInFolder(file.path, folders[type])) ?? null;
}

/** Today as "YYYY-MM-DD", in local time. */
export function today(now = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Set the status and keep `watched` and `finished` in step with it:
 * Completed sets watched and (if empty) today's date; leaving Completed clears both.
 */
export function applyStatus(front: Frontmatter, status: WatchStatus, date: string): void {
	const wasCompleted = front.myStatus === STATUS.completed;
	front.myStatus = status;
	if (status === STATUS.completed) {
		front.watched = true;
		if (!front.finished) front.finished = date;
	} else {
		front.watched = false;
		if (wasCompleted) front.finished = null;
	}
}

/** The number of episodes (chapters for manga) the note says the title has, or null if unknown. */
export function totalOf(front: Frontmatter, type: MediaType): number | null {
	const value = Number(type === 'manga' ? front.chapters : front.episodes);
	return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

export interface ProgressStep {
	progress: number;
	total: number | null;
	/** The last episode or chapter was just reached and the title isn't Completed yet. */
	reachedEnd: boolean;
}

/**
 * Add `delta` (±1) to the progress, never below 0 or past the known total.
 * Counting up from Planned (or no status) starts it: Watching / Reading.
 */
export function stepProgress(front: Frontmatter, delta: number, type: MediaType, date: string): ProgressStep {
	const current = Math.max(0, Math.round(Number(front.progress)) || 0);
	const total = totalOf(front, type);
	let progress = Math.max(0, current + delta);
	if (total !== null) progress = Math.min(progress, total);
	front.progress = progress;
	if (delta > 0 && (!front.myStatus || front.myStatus === STATUS.planned)) applyStatus(front, activeStatus(type), date);
	return {
		progress,
		total,
		reachedEnd: delta > 0 && total !== null && progress >= total && front.myStatus !== STATUS.completed,
	};
}

/** A rating from 1 to 10, or null to clear it (stored as N/A, as the templates have it). */
export function applyRating(front: Frontmatter, rating: number | null): void {
	front.rating = rating === null ? 'N/A' : Math.min(10, Math.max(1, Math.round(rating)));
}

/** Run one of the functions above on a note's properties; Obsidian rewrites the frontmatter safely. */
export async function updateTracking<T>(app: App, file: TFile, change: (front: Frontmatter) => T): Promise<T> {
	let result: T | undefined;
	await app.fileManager.processFrontMatter(file, (front: Frontmatter) => {
		result = change(front);
	});
	return result as T;
}
