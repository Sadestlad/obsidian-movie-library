import { MediaError } from '../core/errors';
import { badResponse, httpRequest, parseJson, Progress, RequestOptions } from '../core/http';
import { asRecord, asString, uniqueStrings } from '../core/utils';
import { htmlToText, normalizeGenres, positiveInt, preferYear } from './common';
import { personName } from './myanimelist';
import { emptyTitle, MediaSource, SearchQuery, SearchResult, Title } from './types';

// Manga, manhwa, manhua, and light novels from AniList (https://anilist.co): a free GraphQL API,
// no account or key. The default manga source, with Jikan as the backup. Each note links to
// the title's AniList page.

const NAME = 'AniList';
const API = 'https://graphql.anilist.co';
const SEARCH_LIMIT = 20;

// AniList's rate limit is 90 requests a minute (lower when it's under load).
const THROTTLE = { key: 'anilist', intervalMs: 700 };

const FIELDS = `
	id
	idMal
	siteUrl
	title { romaji english native }
	format
	status
	chapters
	volumes
	countryOfOrigin
	startDate { year month day }
	endDate { year month day }
	genres
	averageScore
	description(asHtml: false)
	coverImage { extraLarge large medium }
	staff(perPage: 8, sort: RELEVANCE) { edges { role node { name { full } } } }
`;

// One query for everything: a text search, an AniList ID, or a MyAnimeList ID from a link.
const QUERY = `query ($search: String, $idMal: Int, $isAdult: Boolean, $perPage: Int) {
	Page(perPage: $perPage) {
		media(search: $search, idMal: $idMal, type: MANGA, isAdult: $isAdult, sort: SEARCH_MATCH) {${FIELDS}}
	}
}`;

function options(progress?: Progress): RequestOptions {
	return {
		sourceName: NAME,
		method: 'POST',
		contentType: 'application/json',
		headers: { Accept: 'application/json' },
		throttle: THROTTLE,
		timeoutMs: 15_000,
		onProgress: progress,
	};
}

/** Send a query; returns the list of media, or throws a MediaError. */
async function queryMedia(variables: Record<string, unknown>, progress?: Progress): Promise<Record<string, unknown>[]> {
	const response = await httpRequest(API, { ...options(progress), body: JSON.stringify({ query: QUERY, variables }) });
	// AniList answers 404 (with an errors list) when an ID lookup finds nothing.
	if (response.status === 404) return [];
	if (response.status !== 200) throw badResponse(NAME);
	const data = asRecord(asRecord(parseJson(response, NAME)).data);
	const media = asRecord(data.Page).media;
	if (!Array.isArray(media)) throw badResponse(NAME);
	return media.map(asRecord).filter((item) => typeof item.id === 'number');
}

export const anilist: MediaSource = {
	id: 'anilist',
	name: NAME,
	types: ['manga'],
	throttle: THROTTLE,

	isConfigured: () => true,

	async search(query: SearchQuery, _type, plugin, progress) {
		// An anime link is for the anime search, not this one.
		if (query.malId !== null && query.malKind === 'anime') return [];
		const variables: Record<string, unknown> =
			query.malId !== null ? { idMal: query.malId, perPage: 1 } : { search: query.text, perPage: SEARCH_LIMIT };
		// A MyAnimeList link always finds its title; a text search hides adult titles if the setting says so.
		if (plugin.settings.hideAdult && query.malId === null) variables.isAdult = false;
		const items = await queryMedia(variables, progress);
		return preferYear(items.map(toResult), query.year);
	},

	// The search answer already has everything a note needs.
	details: (result) => Promise.resolve(result.title),

	async check() {
		const items = await queryMedia({ search: 'Berserk', perPage: 1 });
		if (items.length === 0) throw new MediaError('bad-response', `${NAME} answered, but found nothing for a test search.`);
		return `${NAME} is working.`;
	},
};

/** AniList's format and country of origin → MyAnimeList's wording, so both sources fill `format` alike. */
export function formatName(format: string, country: string): string {
	if (format === 'NOVEL') return 'Light Novel';
	if (format === 'ONE_SHOT') return 'One-shot';
	if (country === 'KR') return 'Manhwa';
	if (country === 'CN' || country === 'TW') return 'Manhua';
	return 'Manga';
}

/** AniList's status → MyAnimeList's wording. */
export function statusName(status: string): string {
	const names: Record<string, string> = {
		FINISHED: 'Finished',
		RELEASING: 'Publishing',
		NOT_YET_RELEASED: 'Not yet published',
		CANCELLED: 'Discontinued',
		HIATUS: 'On Hiatus',
	};
	return names[status] ?? '';
}

/** { year: 2018, month: 3, day: 4 } → "2018-03-04", as precise as AniList knows; "" when unknown. */
export function fuzzyDate(value: unknown): string {
	const date = asRecord(value);
	const year = positiveInt(date.year);
	if (!year) return '';
	const month = positiveInt(date.month);
	const day = positiveInt(date.day);
	const pad = (n: number) => String(n).padStart(2, '0');
	return [String(year), month ? pad(month) : '', month && day ? pad(day) : ''].filter(Boolean).join('-');
}

// Staff roles that make someone an author: "Story & Art", "Story", "Art", "Original Story", "Original Creator".
// Translators, letterers, editors and the like are left out.
const AUTHOR_ROLE = /^(story|art|original)/i;

function toResult(item: Record<string, unknown>): SearchResult {
	const id = String(item.id);
	const titles = asRecord(item.title);
	const cover = asRecord(item.coverImage);
	const poster = asString(cover.extraLarge) || asString(cover.large);
	const firstPublished = fuzzyDate(item.startDate);
	const edges = (Array.isArray(asRecord(item.staff).edges) ? (asRecord(item.staff).edges as unknown[]) : []).map(asRecord);
	const authors = edges
		.filter((edge) => AUTHOR_ROLE.test(asString(edge.role)))
		.map((edge) => asString(asRecord(asRecord(edge.node).name).full));
	const score = typeof item.averageScore === 'number' && item.averageScore > 0 ? Math.round(item.averageScore) / 10 : null;

	const title: Title = {
		...emptyTitle('manga', {
			id: 'anilist',
			name: NAME,
			url: asString(item.siteUrl) || `https://anilist.co/manga/${id}`,
			key: `anilist-${id}`,
		}),
		title: asString(titles.romaji) || asString(titles.english),
		romajiTitle: asString(titles.romaji),
		englishTitle: asString(titles.english),
		// Japanese, Korean, or Chinese, depending on where it's from.
		japaneseTitle: asString(titles.native),
		format: formatName(asString(item.format), asString(item.countryOfOrigin)),
		year: positiveInt(asRecord(item.startDate).year),
		chapters: positiveInt(item.chapters),
		volumes: positiveInt(item.volumes),
		status: statusName(asString(item.status)),
		firstAired: firstPublished,
		lastAired: fuzzyDate(item.endDate),
		// AniList gives full names in reading order already; personName only flips "Last, First".
		creators: uniqueStrings(authors.filter(Boolean).map(personName)),
		genres: normalizeGenres((Array.isArray(item.genres) ? item.genres : []).map(asString)),
		score,
		description: cleanDescription(asString(item.description)),
		posterUrl: poster,
		posterDownloadUrl: poster,
	};
	return { title, thumbnailUrl: asString(cover.medium) || poster, ref: { id } };
}

/** AniList descriptions may hold HTML (<br>, <i>) and end with a "(Source: …)" line, which stays. */
export function cleanDescription(text: string): string {
	return htmlToText(text);
}
