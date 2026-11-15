import { Menu, Notice, Plugin, TFile } from 'obsidian';
import { toMediaError } from './core/errors';
import { clearCache, setUserAgent } from './core/http';
import { regenerateLibraryNote } from './library/moc';
import { refreshTmdbNotes, remindIfDue } from './library/tmdb-refresh';
import {
	applyRating,
	applyStatus,
	mediaTypeOf,
	statusChoices,
	stepProgress,
	today,
	updateTracking,
	WatchStatus,
} from './library/tracking';
import { isWatchNote, toggleWatched } from './library/watched-status';
import { createTitleNote } from './media/create-note';
import type { MediaType } from './media/types';
import { sanitizeSettings, WatchlistNotesSettings, WatchlistNotesSettingTab } from './settings';
import { forgetFailures } from './sources';
import { tmdb } from './sources/tmdb';
import { askChoice } from './ui/choice-modal';
import { pickItem } from './ui/pick-modal';

// One command per type, so each can have its own hotkey; the ribbon icon offers the same as a menu.
const CREATE_COMMANDS: { type: MediaType; id: string; name: string; menu: string; icon: string }[] = [
	{ type: 'movie', id: 'create-movie-note', name: 'Create movie note', menu: 'Movie', icon: 'film' },
	{ type: 'tv', id: 'create-tv-show-note', name: 'Create TV show note', menu: 'TV show', icon: 'tv' },
	{ type: 'anime', id: 'create-anime-note', name: 'Create anime note', menu: 'Anime', icon: 'sparkles' },
	{ type: 'manga', id: 'create-manga-note', name: 'Create manga / manhwa note', menu: 'Manga / manhwa', icon: 'book-open' },
];

export default class WatchlistNotesPlugin extends Plugin {
	settings!: WatchlistNotesSettings;

	async onload() {
		await this.loadSettings();
		// No contact email; the repo link identifies the plugin to each service.
		setUserAgent(`WatchlistNotes/${this.manifest.version} (+https://github.com/Sadestlad/obsidian-movie-library)`);

		for (const command of CREATE_COMMANDS) {
			this.addCommand({
				id: command.id,
				name: command.name,
				callback: () => this.create(command.type),
			});
		}
		this.addCommand({
			id: 'toggle-watched-status',
			name: 'Toggle watched status',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!isWatchNote(file, this.settings)) return false;
				if (!checking) {
					this.run(async () => {
						const watched = await toggleWatched(this.app, file);
						new Notice(watched ? `Marked "${file.basename}" as watched.` : `Marked "${file.basename}" as unwatched.`);
					});
				}
				return true;
			},
		});
		this.addCommand({
			id: 'set-watch-status',
			name: 'Set status',
			checkCallback: (checking) => this.onWatchNote(checking, (file, type) => this.setStatus(file, type)),
		});
		this.addCommand({
			id: 'progress-add-one',
			name: 'Add one episode / chapter',
			checkCallback: (checking) =>
				this.onWatchNote(checking, (file, type) => this.stepProgress(file, type, 1), (type) => type !== 'movie'),
		});
		this.addCommand({
			id: 'progress-remove-one',
			name: 'Remove one episode / chapter',
			checkCallback: (checking) =>
				this.onWatchNote(checking, (file, type) => this.stepProgress(file, type, -1), (type) => type !== 'movie'),
		});
		this.addCommand({
			id: 'rate-title',
			name: 'Rate',
			checkCallback: (checking) => this.onWatchNote(checking, (file) => this.rate(file)),
		});
		this.addCommand({
			id: 'regenerate-watch-library',
			name: 'Regenerate library note',
			callback: () => {
				remindIfDue(this);
				this.run(() => regenerateLibraryNote(this));
			},
		});
		this.addCommand({
			id: 'refresh-tmdb-notes',
			name: `Refresh ${tmdb.name} notes`,
			callback: () => this.run(() => refreshTmdbNotes(this)),
		});

		this.addRibbonIcon('clapperboard', 'Create a watchlist note', (evt) => {
			const menu = new Menu();
			for (const command of CREATE_COMMANDS) {
				menu.addItem((item) =>
					item
						.setTitle(command.menu)
						.setIcon(command.icon)
						.onClick(() => this.create(command.type)),
				);
			}
			menu.showAtMouseEvent(evt);
		});

		this.addSettingTab(new WatchlistNotesSettingTab(this.app, this));
	}

	onunload() {
		clearCache();
		forgetFailures();
	}

	/** A secret from Obsidian's keychain (settings store only its name), or "" if not set. */
	getSecret(name: string): string {
		return name ? (this.app.secretStorage.getSecret(name) ?? '') : '';
	}

	async loadSettings() {
		this.settings = sanitizeSettings((await this.loadData()) as Partial<WatchlistNotesSettings> | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Create a note; first, once per session, mention notes from TMDB that are due for a refresh. */
	private create(type: MediaType) {
		remindIfDue(this);
		this.run(() => createTitleNote(this, type));
	}

	/**
	 * For commands that work on the open note: available only when it's in one of
	 * the type folders (and `allowed` for its type); then runs `action`.
	 */
	private onWatchNote(
		checking: boolean,
		action: (file: TFile, type: MediaType) => Promise<void>,
		allowed: (type: MediaType) => boolean = () => true,
	): boolean {
		const file = this.app.workspace.getActiveFile();
		const type = mediaTypeOf(file, this.settings);
		if (!file || !type || !allowed(type)) return false;
		if (!checking) this.run(() => action(file, type));
		return true;
	}

	private async setStatus(file: TFile, type: MediaType): Promise<void> {
		const current: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.myStatus;
		const status = await pickItem<WatchStatus>(this.app, {
			items: statusChoices(type),
			placeholder: `Status for "${file.basename}"${typeof current === 'string' && current ? ` (now ${current})` : ''}`,
			emptyText: 'No status matches.',
			matches: (item, query) => item.toLowerCase().includes(query),
			render: (item, el) => {
				el.setText(item);
			},
		});
		if (!status) return;
		await updateTracking(this.app, file, (front) => applyStatus(front, status, today()));
		new Notice(`"${file.basename}": ${status}.`);
	}

	private async stepProgress(file: TFile, type: MediaType, delta: number): Promise<void> {
		const unit = type === 'manga' ? 'Chapter' : 'Episode';
		const step = await updateTracking(this.app, file, (front) => stepProgress(front, delta, type, today()));
		new Notice(`"${file.basename}": ${unit.toLowerCase()} ${step.progress}${step.total ? ` / ${step.total}` : ''}.`);
		if (!step.reachedEnd) return;
		const done = await askChoice(this.app, 'Finished?', `That was the last ${unit.toLowerCase()} of "${file.basename}". Mark it as completed?`, [
			{ label: 'Mark completed', value: true, cta: true },
			{ label: 'Not yet', value: null },
		]);
		if (done) {
			await updateTracking(this.app, file, (front) => applyStatus(front, 'Completed', today()));
			new Notice(`"${file.basename}": Completed.`);
		}
	}

	private async rate(file: TFile): Promise<void> {
		const options: { label: string; value: number | null }[] = [
			...[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ label: `${n} / 10`, value: n })),
			{ label: 'Clear rating', value: null },
		];
		const choice = await pickItem(this.app, {
			items: options,
			placeholder: `Rate "${file.basename}"`,
			emptyText: 'Type a number from 1 to 10.',
			matches: (item, query) => item.label.toLowerCase().startsWith(query),
			render: (item, el) => {
				el.setText(item.label);
			},
		});
		if (!choice) return;
		await updateTracking(this.app, file, (front) => applyRating(front, choice.value));
		new Notice(choice.value === null ? `Cleared the rating of "${file.basename}".` : `Rated "${file.basename}" ${choice.value} / 10.`);
	}

	private run(task: () => Promise<void>) {
		task().catch((err: unknown) => {
			new Notice(toMediaError(err).message, 10_000);
		});
	}
}
