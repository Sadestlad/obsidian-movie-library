import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TFile } from 'obsidian';
import {
	activeStatus,
	applyRating,
	applyStatus,
	mediaTypeOf,
	statusChoices,
	stepProgress,
	today,
	totalOf,
	updateTracking,
} from '../src/library/tracking';
import { DEFAULT_SETTINGS } from '../src/settings';
import { frontmatter, makeApp } from './support/vault';

const DATE = '2026-11-15';

describe('status', () => {
	it('offers Reading for manga and Watching for everything else', () => {
		assert.deepEqual(statusChoices('manga'), ['Planned', 'Reading', 'Completed', 'On hold', 'Dropped']);
		assert.deepEqual(statusChoices('anime'), ['Planned', 'Watching', 'Completed', 'On hold', 'Dropped']);
		assert.equal(activeStatus('tv'), 'Watching');
	});

	it('Completed sets watched and the finish date, and keeps a date already there', () => {
		const front: Record<string, unknown> = { myStatus: 'Watching', watched: false };
		applyStatus(front, 'Completed', DATE);
		assert.deepEqual(front, { myStatus: 'Completed', watched: true, finished: DATE });
		const earlier: Record<string, unknown> = { finished: '2025-01-01' };
		applyStatus(earlier, 'Completed', DATE);
		assert.equal(earlier.finished, '2025-01-01');
	});

	it('leaving Completed clears watched and the finish date; other changes leave the date alone', () => {
		const front: Record<string, unknown> = { myStatus: 'Completed', watched: true, finished: DATE };
		applyStatus(front, 'Dropped', DATE);
		assert.deepEqual(front, { myStatus: 'Dropped', watched: false, finished: null });
		const paused: Record<string, unknown> = { myStatus: 'Watching', finished: '2024-02-02' };
		applyStatus(paused, 'On hold', DATE);
		assert.equal(paused.finished, '2024-02-02');
	});

	it('leaves the source’s own status property alone', () => {
		const front: Record<string, unknown> = { status: 'Finished Airing' };
		applyStatus(front, 'Watching', DATE);
		assert.equal(front.status, 'Finished Airing');
	});
});

describe('progress', () => {
	it('counts up, starts a planned title, and stops at the known total', () => {
		const front: Record<string, unknown> = { episodes: 3, progress: 0, myStatus: 'Planned' };
		assert.deepEqual(stepProgress(front, 1, 'anime', DATE), { progress: 1, total: 3, reachedEnd: false });
		assert.equal(front.myStatus, 'Watching');
		stepProgress(front, 1, 'anime', DATE);
		assert.deepEqual(stepProgress(front, 1, 'anime', DATE), { progress: 3, total: 3, reachedEnd: true });
		assert.equal(stepProgress(front, 1, 'anime', DATE).progress, 3, 'not past the total');
	});

	it('uses chapters for manga, and counts on when the total is unknown (still publishing)', () => {
		const front: Record<string, unknown> = { chapters: null, episodes: 5 };
		assert.deepEqual(stepProgress(front, 1, 'manga', DATE), { progress: 1, total: null, reachedEnd: false });
		assert.equal(front.myStatus, 'Reading', 'no status counts as planned');
		front.progress = 87;
		assert.equal(stepProgress(front, 1, 'manga', DATE).progress, 88);
		assert.equal(totalOf({ chapters: 200 }, 'manga'), 200);
		assert.equal(totalOf({ episodes: 'N/A' }, 'tv'), null);
	});

	it('counts down to zero without touching the status, and doesn’t ask again once completed', () => {
		const front: Record<string, unknown> = { progress: 1, myStatus: 'On hold' };
		stepProgress(front, -1, 'tv', DATE);
		stepProgress(front, -1, 'tv', DATE);
		assert.deepEqual(front, { progress: 0, myStatus: 'On hold' });
		const done: Record<string, unknown> = { episodes: 2, progress: 1, myStatus: 'Completed' };
		assert.equal(stepProgress(done, 1, 'tv', DATE).reachedEnd, false);
	});

	it('treats text or a missing value as 0', () => {
		const front: Record<string, unknown> = { progress: 'N/A' };
		assert.equal(stepProgress(front, 1, 'tv', DATE).progress, 1);
	});
});

describe('rating', () => {
	it('stores 1–10, and N/A when cleared', () => {
		const front: Record<string, unknown> = { rating: 'N/A' };
		applyRating(front, 8);
		assert.equal(front.rating, 8);
		applyRating(front, 14);
		assert.equal(front.rating, 10);
		applyRating(front, null);
		assert.equal(front.rating, 'N/A');
	});
});

describe('tracking notes in the vault', () => {
	it('knows each note’s type from its folder, manga included', () => {
		const app = makeApp();
		const manga = app.vault.put('Watch Library/Manga/Solo Leveling.md', '---\ntitle: x\n---\n');
		const anime = app.vault.put('Watch Library/Anime/Frieren.md', '---\ntitle: x\n---\n');
		const moc = app.vault.put('Watch Library/Watch Library MOC.md', '');
		assert.equal(mediaTypeOf(manga as unknown as TFile, DEFAULT_SETTINGS), 'manga');
		assert.equal(mediaTypeOf(anime as unknown as TFile, DEFAULT_SETTINGS), 'anime');
		assert.equal(mediaTypeOf(moc as unknown as TFile, DEFAULT_SETTINGS), null);
	});

	it('changes only the tracking properties and keeps the note text', async () => {
		const app = makeApp();
		const file = app.vault.put('Watch Library/Manga/Solo Leveling.md', '---\ntitle: Solo Leveling\nchapters: 200\nprogress: 0\nmyStatus: Planned\n---\nMy notes.\n') as unknown as TFile;
		await updateTracking(app as never, file, (front) => stepProgress(front, 1, 'manga', DATE));
		assert.deepEqual(frontmatter(app, file.path), { title: 'Solo Leveling', chapters: 200, progress: 1, myStatus: 'Reading', watched: false });
		assert.match(app.files.get(file.path) as string, /My notes\.\n$/);
	});

	it('writes dates as YYYY-MM-DD in local time', () => {
		assert.equal(today(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
	});
});
