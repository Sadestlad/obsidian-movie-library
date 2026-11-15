import { Notice, TFile } from 'obsidian';
import { isInFolder, libraryPaths } from '../core/paths';
import type WatchlistNotesPlugin from '../main';
import { coverEmbed } from '../media/templates';
import { MEDIA_TYPES } from '../media/types';
import { askChoice } from '../ui/choice-modal';

/** The poster path a note's `localCover` points to ("[[Posters/x.jpg]]", "![[…]]", "[[…|alias]]", or a plain path), or "". */
export function posterPathOf(localCover: unknown): string {
	if (typeof localCover !== 'string') return '';
	return localCover
		.trim()
		.replace(/^!?\[\[/, '')
		.replace(/\]\]$/, '')
		.replace(/\|.*$/, '')
		.replace(/^\//, '')
		.trim();
}

/** Whether the note body already shows this poster (any embed of it, at any size). */
export function hasCoverEmbed(content: string, posterPath: string): boolean {
	const name = posterPath.split('/').pop() ?? posterPath;
	const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
	return body.split('\n').some((line) => line.includes('![[') && (line.includes(posterPath) || line.includes(name)));
}

/** The note with the poster embed added right after its frontmatter. */
export function withCoverEmbed(content: string, posterPath: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
	const embed = coverEmbed(posterPath);
	if (!match) return `${embed}\n${content}`;
	const front = match[0].endsWith('\n') ? match[0] : `${match[0]}\n`;
	return `${front}${embed}\n${content.slice(match[0].length)}`;
}

/** Notes in the type folders that have a poster but don't show it in their body yet. */
function notesWithoutCover(plugin: WatchlistNotesPlugin): { file: TFile; posterPath: string }[] {
	const { app } = plugin;
	const { folders } = libraryPaths(plugin.settings);
	const found: { file: TFile; posterPath: string }[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (!MEDIA_TYPES.some((type) => isInFolder(file.path, folders[type]))) continue;
		const posterPath = posterPathOf(app.metadataCache.getFileCache(file)?.frontmatter?.localCover);
		if (posterPath) found.push({ file, posterPath });
	}
	return found;
}

/**
 * Add the poster to the top of every watchlist note that has one but doesn't
 * show it yet, after the user confirms. Only that one line is added.
 */
export async function addCoversToNotes(plugin: WatchlistNotesPlugin): Promise<void> {
	const { app } = plugin;
	const candidates: { file: TFile; posterPath: string }[] = [];
	for (const note of notesWithoutCover(plugin)) {
		if (!hasCoverEmbed(await app.vault.cachedRead(note.file), note.posterPath)) candidates.push(note);
	}
	if (candidates.length === 0) {
		new Notice('Every note with a poster already shows it.');
		return;
	}
	const count = `${candidates.length} note${candidates.length === 1 ? '' : 's'}`;
	const ok = await askChoice(
		app,
		'Add covers to notes',
		`Add the poster to the top of ${count}? Only one line is added under the properties of each; nothing else changes.`,
		[
			{ label: `Add to ${count}`, value: true, cta: true },
			{ label: 'Cancel', value: null },
		],
	);
	if (!ok) return;
	let added = 0;
	for (const { file, posterPath } of candidates) {
		await app.vault.process(file, (data) => {
			if (hasCoverEmbed(data, posterPath)) return data;
			added++;
			return withCoverEmbed(data, posterPath);
		});
	}
	new Notice(`Added the cover to ${added} note${added === 1 ? '' : 's'}.`);
}
