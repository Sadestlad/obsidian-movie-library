import type { RequestUrlResponse } from 'obsidian';
import { MediaError } from '../core/errors';
import { badResponse, getJson, Progress, RequestOptions } from '../core/http';
import type { ThrottleRule } from '../core/throttle';
import { asRecord, asString, uniqueStrings } from '../core/utils';
import { normalizeGenres, positiveInt, preferYear, score, yearOf } from './common';
import type { MediaType } from '../media/types';
import { emptyTitle, MediaSource, SearchQuery, SearchResult, Title } from './types';

// Anime from MyAnimeList, through two free APIs that answer in the same (Jikan v4) format:
// Tenrai (default, https://tenrai.org) and Jikan (backup, https://jikan.moe). Neither needs an
// account. Each note links to the anime's MyAnimeList page.
// Manga (and manhwa, manhua, light novels) come from Jikan only: Tenrai is used for anime alone.

/** The site the anime information comes from (for credits and messages). */
export const MYANIMELIST = 'MyAnimeList';

const SEARCH_LIMIT = 20;
// Both can be slow when MyAnimeList is.
const TIMEOUT_MS = 20_000;
// Commercials, promotional videos, and music videos aren't series or films.
const LEFT_OUT_TYPES = new Set(['CM', 'PV', 'Music']);

interface ApiConfig {
	id: 'tenrai' | 'jikan';
	name: string;
	base: string;
	throttle: ThrottleRule;
	/** What this API is used for. */
	types: readonly ('anime' | 'manga')[];
}

/** A source for an API that answers in Jikan v4's format. */
function myAnimeListApi({ id, name, base, throttle, types }: ApiConfig): MediaSource {
	const options = (progress?: Progress): RequestOptions & { cache: boolean } => ({
		sourceName: name,
		throttle,
		timeoutMs: TIMEOUT_MS,
		onProgress: progress,
		cache: true,
		// Both answer 504 when they can't reach MyAnimeList (Jikan: "Jikan failed to connect to MyAnimeList").
		describeServerError: (response: RequestUrlResponse) =>
			response.status === 504 || /MyAnimeList/i.test(response.text)
				? `${name} can't reach MyAnimeList right now. Try again later, or search another source.`
				: undefined,
	});

	return {
		id,
		name,
		types,
		throttle,

		isConfigured: () => true,

		async search(query, type, plugin, progress) {
			const kind = malKind(type);
			const convert = (item: Record<string, unknown>) =>
				kind === 'manga' ? toMangaResult(item, id, name) : toResult(item, id, name);
			if (query.malId !== null) {
				// A link to the other kind (an anime link in a manga search) finds nothing here.
				if (!linkMatches(query, kind)) return [];
				// A MyAnimeList link: that one title, whatever its rating.
				try {
					const item = asRecord(asRecord(await getJson(`${base}/${kind}/${query.malId}/full`, options(progress))).data);
					return isAnime(item) ? [convert(item)] : [];
				} catch (err) {
					if (err instanceof MediaError && err.kind === 'not-found') return [];
					throw err;
				}
			}
			const params = new URLSearchParams({ q: query.text, limit: String(SEARCH_LIMIT) });
			if (plugin.settings.hideAdult) params.set('sfw', 'true');
			const data = asRecord(await getJson(`${base}/${kind}?${params.toString()}`, options(progress)));
			if (!Array.isArray(data.data)) throw badResponse(name);
			const leftOut = kind === 'manga' ? LEFT_OUT_MANGA_TYPES : LEFT_OUT_TYPES;
			const items = data.data.map(asRecord).filter((item) => isAnime(item) && !leftOut.has(asString(item.type)));
			return preferYear(items.map(convert), query.year);
		},

		// Search answers already have everything a note needs, so no second request.
		details: (result) => Promise.resolve(result.title),

		async check() {
			const item = asRecord(asRecord(await getJson(`${base}/anime/1`, options())).data);
			if (!isAnime(item)) throw badResponse(name);
			return `${name} is working.`;
		},
	};
}

export const tenrai = myAnimeListApi({
	id: 'tenrai',
	name: 'Tenrai',
	base: 'https://api.tenrai.org/v1',
	// 120 requests a minute (and 4 a second) per IP address.
	throttle: { key: 'tenrai', intervalMs: 500 },
	types: ['anime'],
});

export const jikan = myAnimeListApi({
	id: 'jikan',
	name: 'Jikan',
	base: 'https://api.jikan.moe/v4',
	// 60 requests a minute (and 3 a second).
	throttle: { key: 'jikan', intervalMs: 1000 },
	types: ['anime', 'manga'],
});

// Doujinshi are fan-made; they'd crowd out the series people look for.
const LEFT_OUT_MANGA_TYPES = new Set(['Doujinshi']);

function malKind(type: MediaType): 'anime' | 'manga' {
	return type === 'manga' ? 'manga' : 'anime';
}

/** Whether a MyAnimeList link in the query is to this kind of page. */
function linkMatches(query: SearchQuery, kind: 'anime' | 'manga'): boolean {
	return (query.malKind ?? 'anime') === kind;
}

function isAnime(item: Record<string, unknown>): boolean {
	return typeof item.mal_id === 'number' && asString(item.title) !== '';
}

function toResult(item: Record<string, unknown>, id: 'tenrai' | 'jikan', name: string): SearchResult {
	const malId = String(item.mal_id);
	const titles = (Array.isArray(item.titles) ? item.titles : []).map(asRecord);
	const titleOfType = (type: string) => asString(titles.find((t) => asString(t.type) === type)?.title);
	const aired = asRecord(item.aired);
	const firstAired = asString(aired.from).slice(0, 10);
	const images = asRecord(asRecord(item.images).jpg);
	const poster = asString(images.large_image_url) || asString(images.image_url);
	const year = positiveInt(item.year) ?? yearOf(firstAired);
	const season = asString(item.season);
	const names = (value: unknown) => uniqueStrings((Array.isArray(value) ? value : []).map((entry) => asString(asRecord(entry).name)));

	const title: Title = {
		...emptyTitle('anime', {
			id,
			name,
			url: asString(item.url) || `https://myanimelist.net/anime/${malId}`,
			// Tenrai and Jikan share MyAnimeList's IDs, so the same anime gets the same poster file.
			key: `mal-${malId}`,
		}),
		title: asString(item.title),
		romajiTitle: asString(item.title) || titleOfType('Default'),
		englishTitle: asString(item.title_english) || titleOfType('English'),
		japaneseTitle: asString(item.title_japanese) || titleOfType('Japanese'),
		format: asString(item.type),
		year,
		episodes: positiveInt(item.episodes),
		status: asString(item.status),
		firstAired,
		lastAired: asString(aired.to).slice(0, 10),
		studios: names(item.studios),
		genres: normalizeGenres(names(item.genres)),
		runtime: minutes(asString(item.duration)),
		ageRating: asString(item.rating),
		season: season && year ? `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}` : '',
		score: score(item.score),
		description: cleanSynopsis(asString(item.synopsis)),
		posterUrl: poster,
		posterDownloadUrl: poster,
	};
	return { title, thumbnailUrl: asString(images.small_image_url) || poster, ref: { id: malId } };
}

function toMangaResult(item: Record<string, unknown>, id: 'tenrai' | 'jikan', name: string): SearchResult {
	const malId = String(item.mal_id);
	const titles = (Array.isArray(item.titles) ? item.titles : []).map(asRecord);
	const titleOfType = (type: string) => asString(titles.find((t) => asString(t.type) === type)?.title);
	const published = asRecord(item.published);
	const firstPublished = asString(published.from).slice(0, 10);
	const images = asRecord(asRecord(item.images).jpg);
	const poster = asString(images.large_image_url) || asString(images.image_url);
	const names = (value: unknown) => uniqueStrings((Array.isArray(value) ? value : []).map((entry) => asString(asRecord(entry).name)));

	const title: Title = {
		...emptyTitle('manga', {
			id,
			name,
			url: asString(item.url) || `https://myanimelist.net/manga/${malId}`,
			// "manga" in the key, because anime and manga IDs overlap on MyAnimeList.
			key: `mal-manga-${malId}`,
		}),
		title: asString(item.title),
		romajiTitle: asString(item.title) || titleOfType('Default'),
		englishTitle: asString(item.title_english) || titleOfType('English'),
		// For manhwa and manhua this is the Korean or Chinese title.
		japaneseTitle: asString(item.title_japanese) || titleOfType('Japanese'),
		format: asString(item.type),
		year: yearOf(firstPublished),
		chapters: positiveInt(item.chapters),
		volumes: positiveInt(item.volumes),
		status: asString(item.status),
		firstAired: firstPublished,
		lastAired: asString(published.to).slice(0, 10),
		creators: names(item.authors).map(personName),
		genres: normalizeGenres(names(item.genres)),
		score: score(item.score),
		description: cleanSynopsis(asString(item.synopsis)),
		posterUrl: poster,
		posterDownloadUrl: poster,
	};
	return { title, thumbnailUrl: asString(images.small_image_url) || poster, ref: { id: malId } };
}

/** MyAnimeList lists people as "Miura, Kentarou"; notes read better as "Kentarou Miura". */
export function personName(name: string): string {
	const parts = name.split(',').map((part) => part.trim());
	return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : name.trim();
}

/** "24 min per ep" → 24, "2 hr 4 min" → 124. */
export function minutes(duration: string): number | null {
	const hours = Number(/(\d+)\s*hr/.exec(duration)?.[1] ?? 0);
	const mins = Number(/(\d+)\s*min/.exec(duration)?.[1] ?? 0);
	return hours * 60 + mins || null;
}

/** MyAnimeList synopses end with a credit line such as "[Written by MAL Rewrite]"; the source note stays. */
export function cleanSynopsis(text: string): string {
	return text.replace(/\s*\[Written by MAL Rewrite\]\s*$/i, '').trim();
}
