import { Notice, TFile } from 'obsidian';
import { ensureFolder } from '../core/notes';
import { libraryPaths } from '../core/paths';
import type WatchlistNotesPlugin from '../main';
import { MEDIA_HEADINGS, MEDIA_TYPES } from '../media/types';
import type { WatchlistNotesSettings } from '../settings';
import { askChoice } from '../ui/choice-modal';
import { STATUS } from './tracking';

// A poster wall made with Obsidian's built-in Bases (core plugin, Obsidian 1.9+): a .base file
// in the library folder with Cards views, one tab each for what you're watching, what's
// planned, what's done, and each type. Status and rating can be edited right on the cards.

export const GALLERY_NAME = 'Watch Library Gallery';

/** Text for a single-quoted YAML string holding a Bases expression. */
function yamlQuoted(expression: string): string {
	return `'${expression.replace(/'/g, "''")}'`;
}

/** A Bases string literal: double quotes, with backslashes and quotes escaped. */
function literal(text: string): string {
	return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Card settings shared by every view: posters at 2:3, cropped to fill. */
const CARD_SETTINGS = ['    image: note.localCover', '    imageFit: cover', '    imageAspectRatio: 1.5', '    cardSize: 170'];

function cardsView(name: string, filter: string | null, order: string[], sort: { property: string; direction: 'ASC' | 'DESC' }): string {
	return [
		'  - type: cards',
		`    name: ${literal(name)}`,
		...(filter ? ['    filters:', '      and:', `        - ${yamlQuoted(filter)}`] : []),
		'    order:',
		...order.map((property) => `      - ${property}`),
		'    sort:',
		`      - property: ${sort.property}`,
		`        direction: ${sort.direction}`,
		...CARD_SETTINGS,
	].join('\n');
}

/** The .base file: every note in the type folders, as poster cards. */
export function galleryBase(settings: WatchlistNotesSettings): string {
	const { folders } = libraryPaths(settings);
	const inFolder = (folder: string) => `file.inFolder(${literal(folder)})`;
	const status = (value: string) => `myStatus == ${literal(value)}`;
	const byName = { property: 'file.name', direction: 'ASC' } as const;
	const recent = { property: 'file.mtime', direction: 'DESC' } as const;

	return [
		'# Made by Watchlist Notes Plus ("Create poster gallery"). Edit freely: it is not regenerated on its own.',
		'filters:',
		'  and:',
		`    - ${yamlQuoted('file.ext == "md"')}`,
		'    - or:',
		...MEDIA_TYPES.map((type) => `        - ${yamlQuoted(inFolder(folders[type]))}`),
		'formulas:',
		// "12 / 24" when the total is known, else just the count; empty for movies.
		`  progress_text: ${yamlQuoted(
			'if(note.chapters, note.progress.toString() + " / " + note.chapters.toString(), if(note.episodes, note.progress.toString() + " / " + note.episodes.toString(), if(note.progress, note.progress.toString(), "")))',
		)}`,
		'properties:',
		'  note.myStatus:',
		'    displayName: Status',
		'  note.rating:',
		'    displayName: Rating',
		'  formula.progress_text:',
		'    displayName: Progress',
		'views:',
		cardsView(
			'Watching & reading',
			`${status(STATUS.watching)} || ${status(STATUS.reading)}`,
			['file.name', 'formula.progress_text'],
			recent,
		),
		cardsView('Planned', status(STATUS.planned), ['file.name', 'year'], recent),
		cardsView('Completed', status(STATUS.completed), ['file.name', 'rating', 'finished'], { property: 'finished', direction: 'DESC' }),
		cardsView('Everything', null, ['file.name', 'myStatus'], byName),
		...MEDIA_TYPES.map((type) => cardsView(MEDIA_HEADINGS[type], inFolder(folders[type]), ['file.name', 'myStatus', 'rating'], byName)),
	].join('\n') + '\n';
}

export function galleryPath(settings: WatchlistNotesSettings): string {
	const { root } = libraryPaths(settings);
	return root ? `${root}/${GALLERY_NAME}.base` : `${GALLERY_NAME}.base`;
}

/** Create the gallery (asking before replacing one that exists), then open it. */
export async function createGallery(plugin: WatchlistNotesPlugin): Promise<void> {
	const { app, settings } = plugin;
	const path = galleryPath(settings);
	const content = galleryBase(settings);
	const existing = app.vault.getAbstractFileByPath(path);
	let file: TFile;
	if (existing instanceof TFile) {
		const choice = await askChoice(
			app,
			'Poster gallery',
			`"${path}" already exists. Open it, or replace it with a fresh one built from your current settings? Replacing removes any changes you made to it.`,
			[
				{ label: 'Open it', value: 'open' as const, cta: true },
				{ label: 'Replace', value: 'replace' as const, destructive: true },
				{ label: 'Cancel', value: null },
			],
		);
		if (!choice) return;
		if (choice === 'replace') {
			await app.vault.modify(existing, content);
			new Notice(`Replaced "${path}".`);
		}
		file = existing;
	} else if (existing) {
		new Notice(`"${path}" is a folder. Rename it to create the gallery.`, 10_000);
		return;
	} else {
		await ensureFolder(app, libraryPaths(settings).root);
		file = await app.vault.create(path, content);
		new Notice(`Created the poster gallery "${path}". If it doesn't open as a gallery, turn on Bases in Settings → Core plugins.`, 10_000);
	}
	await app.workspace.getLeaf(false).openFile(file);
}
