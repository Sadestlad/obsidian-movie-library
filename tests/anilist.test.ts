import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearCache } from '../src/core/http';
import type { WatchlistNotesSettings } from '../src/settings';
import { parseQuery } from '../src/sources';
import { anilist, formatName, fuzzyDate, statusName } from '../src/sources/anilist';
import { fake, json, requests, resetNetwork } from './support/network';
import { anilistAnswer } from './support/titles';
import { makeApp, makePlugin } from './support/vault';

const plugin = (settings: Partial<WatchlistNotesSettings> = {}) => makePlugin(makeApp(), settings);
const sent = (index = 0) => JSON.parse(requests[index]?.body ?? '{}') as { query: string; variables: Record<string, unknown> };

describe('manga from AniList (hand-made answers)', () => {
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('searches manga with adult titles hidden, and reads manhwa and ongoing manga', async () => {
		fake('graphql.anilist.co', json(200, anilistAnswer()));
		const results = await anilist.search(parseQuery('solo leveling'), 'manga', plugin());
		assert.equal(requests[0]?.method, 'POST');
		assert.equal(requests[0]?.url, 'https://graphql.anilist.co');
		assert.match(sent().query, /type: MANGA/);
		assert.deepEqual(sent().variables, { search: 'solo leveling', perPage: 20, isAdult: false });

		const solo = results[0]?.title;
		assert.ok(solo);
		assert.equal(solo.type, 'manga');
		assert.equal(solo.title, 'Na Honjaman Level Up');
		assert.equal(solo.englishTitle, 'Solo Leveling');
		assert.equal(solo.japaneseTitle, '나 혼자만 레벨업', 'the native title');
		assert.equal(solo.format, 'Manhwa');
		assert.equal(solo.year, 2018);
		assert.equal(solo.firstAired, '2018-03-04');
		assert.equal(solo.chapters, 201);
		assert.deepEqual(solo.creators, ['Chugong', 'Sung-Lak Jang']);
		assert.deepEqual(solo.genres, ['Action', 'Adventure', 'Fantasy']);
		assert.equal(solo.score, 8.6);
		assert.equal(solo.description, 'E-rank hunter Jinwoo Sung levels up alone.\n\n(Source: Webtoon)');
		assert.equal(solo.source.key, 'anilist-105398');

		const berserk = results[1]?.title;
		assert.equal(berserk?.format, 'Manga');
		assert.equal(berserk?.chapters, null);
		assert.equal(berserk?.status, 'Publishing');
		assert.equal(berserk?.lastAired, '');
		assert.deepEqual(berserk?.genres, ['Action', 'Science fiction']);
		assert.equal(berserk?.posterUrl, 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/berserk.jpg');
	});

	it('shows adult titles when the setting is off', async () => {
		fake('graphql.anilist.co', json(200, anilistAnswer()));
		await anilist.search(parseQuery('berserk'), 'manga', plugin({ hideAdult: false }));
		assert.equal(sent().variables.isAdult, undefined);
	});

	it('finds a MyAnimeList manga link by its MyAnimeList ID, and skips anime links', async () => {
		fake('graphql.anilist.co', json(200, anilistAnswer()));
		await anilist.search(parseQuery('https://myanimelist.net/manga/2/Berserk'), 'manga', plugin());
		assert.deepEqual(sent().variables, { idMal: 2, perPage: 1 });
		assert.deepEqual(await anilist.search(parseQuery('https://myanimelist.net/anime/52991/x'), 'manga', plugin()), []);
		assert.equal(requests.length, 1);
	});

	it('finds nothing (not an error) when AniList answers 404, and reports a broken answer', async () => {
		fake('graphql.anilist.co', json(404, { errors: [{ message: 'Not Found.' }] }));
		assert.deepEqual(await anilist.search(parseQuery('qwxz'), 'manga', plugin()), []);
		clearCache();
		resetNetwork();
		fake('graphql.anilist.co', json(200, { data: null }));
		await assert.rejects(anilist.search(parseQuery('qwxz'), 'manga', plugin()), /AniList/);
	});

	it('words formats, statuses, and dates like MyAnimeList', () => {
		assert.equal(formatName('MANGA', 'KR'), 'Manhwa');
		assert.equal(formatName('MANGA', 'CN'), 'Manhua');
		assert.equal(formatName('MANGA', 'JP'), 'Manga');
		assert.equal(formatName('NOVEL', 'JP'), 'Light Novel');
		assert.equal(formatName('ONE_SHOT', 'JP'), 'One-shot');
		assert.equal(statusName('HIATUS'), 'On Hiatus');
		assert.equal(fuzzyDate({ year: 2018, month: 3, day: 4 }), '2018-03-04');
		assert.equal(fuzzyDate({ year: 2018, month: null, day: null }), '2018');
		assert.equal(fuzzyDate({ year: null }), '');
	});
});
