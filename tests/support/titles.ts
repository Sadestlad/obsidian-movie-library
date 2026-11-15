import type { MediaType } from '../../src/media/types';
import { emptyTitle, Title } from '../../src/sources/types';

/** A complete title of each type, as a source would return it. */
export function sampleTitle(type: MediaType, overrides: Partial<Title> = {}): Title {
	const samples: Record<MediaType, Partial<Title>> = {
		movie: {
			title: 'Inception',
			originalTitle: 'Inception',
			year: 2010,
			releaseDate: '2010-07-15',
			directors: ['Christopher Nolan'],
			cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
			genres: ['Action', 'Science fiction'],
			runtime: 148,
			score: 8.37,
			description: 'Cobb steals secrets from deep within the subconscious.',
			posterUrl: 'https://image.tmdb.org/t/p/w500/inception.jpg',
			posterDownloadUrl: 'https://image.tmdb.org/t/p/w500/inception.jpg',
			imdbId: 'tt1375666',
			source: { id: 'tmdb', name: 'TMDB', url: 'https://www.themoviedb.org/movie/27205', key: 'tmdb-movie-27205' },
		},
		tv: {
			title: 'Severance',
			year: 2022,
			firstAired: '2022-02-18',
			status: 'Running',
			creators: ['Dan Erickson'],
			network: 'Apple TV',
			seasons: 2,
			episodes: 19,
			cast: ['Adam Scott', 'Britt Lower'],
			genres: ['Drama', 'Science fiction', 'Mystery'],
			runtime: 49,
			score: 7.7,
			description: 'Mark Scout leads a team at Lumon Industries.',
			posterUrl: 'https://static.tvmaze.com/uploads/images/original_untouched/548/1371406.jpg',
			posterDownloadUrl: 'https://static.tvmaze.com/uploads/images/medium_portrait/548/1371406.jpg',
			imdbId: 'tt11280740',
			source: { id: 'tvmaze', name: 'TVmaze', url: 'https://www.tvmaze.com/shows/44933/severance', key: 'tvmaze-44933' },
		},
		anime: {
			title: 'Sousou no Frieren',
			englishTitle: "Frieren: Beyond Journey's End",
			romajiTitle: 'Sousou no Frieren',
			japaneseTitle: '葬送のフリーレン',
			format: 'TV',
			year: 2023,
			episodes: 28,
			status: 'Finished Airing',
			firstAired: '2023-09-29',
			lastAired: '2024-03-22',
			studios: ['Madhouse'],
			genres: ['Adventure', 'Drama', 'Fantasy'],
			ageRating: 'PG-13 - Teens 13 or older',
			season: 'Fall 2023',
			score: 9.25,
			description: 'The adventure is over but life goes on for an elf mage.',
			posterUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
			posterDownloadUrl: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
			source: { id: 'tenrai', name: 'Tenrai', url: 'https://myanimelist.net/anime/52991/Sousou_no_Frieren', key: 'mal-52991' },
		},
		manga: {
			title: 'Na Honjaman Level Up',
			englishTitle: 'Solo Leveling',
			romajiTitle: 'Na Honjaman Level Up',
			japaneseTitle: '나 혼자만 레벨업',
			format: 'Manhwa',
			year: 2018,
			chapters: 200,
			status: 'Finished',
			firstAired: '2018-03-04',
			lastAired: '2023-12-29',
			creators: ['Chugong', 'Jang Sung-Rak'],
			genres: ['Action', 'Adventure', 'Fantasy'],
			score: 8.65,
			description: 'E-rank hunter Jinwoo Sung levels up alone.',
			posterUrl: 'https://cdn.myanimelist.net/images/manga/3/222295l.jpg',
			posterDownloadUrl: 'https://cdn.myanimelist.net/images/manga/3/222295l.jpg',
			source: { id: 'jikan', name: 'Jikan', url: 'https://myanimelist.net/manga/121496/Na_Honjaman_Level_Up', key: 'mal-manga-121496' },
		},
	};
	const sample = samples[type];
	return { ...emptyTitle(type, sample.source!), ...sample, ...overrides };
}

/** A Jikan v4 search answer with one anime, for tests that can't use recordings (Jikan was down). */
export function jikanAnswer() {
	return {
		data: [
			{
				mal_id: 52991,
				url: 'https://myanimelist.net/anime/52991/Sousou_no_Frieren',
				images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg', large_image_url: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg' } },
				titles: [
					{ type: 'Default', title: 'Sousou no Frieren' },
					{ type: 'Japanese', title: '葬送のフリーレン' },
					{ type: 'English', title: "Frieren: Beyond Journey's End" },
				],
				title: 'Sousou no Frieren',
				title_english: "Frieren: Beyond Journey's End",
				title_japanese: '葬送のフリーレン',
				type: 'TV',
				episodes: 28,
				status: 'Finished Airing',
				aired: { from: '2023-09-29T00:00:00+00:00', to: '2024-03-22T00:00:00+00:00' },
				duration: '24 min per ep',
				rating: 'PG-13 - Teens 13 or older',
				score: 9.25,
				synopsis: 'The adventure is over but life goes on for an elf mage.\n\n[Written by MAL Rewrite]',
				season: 'fall',
				year: 2023,
				studios: [{ name: 'Madhouse' }],
				genres: [{ name: 'Adventure' }, { name: 'Award Winning' }, { name: 'Fantasy' }],
			},
		],
	};
}

/** A Jikan v4 manga search answer: a manhwa, a finished manga, and a doujinshi that's left out. Hand-made, in Jikan's shape. */
export function jikanMangaAnswer() {
	return {
		data: [
			{
				mal_id: 121496,
				url: 'https://myanimelist.net/manga/121496/Na_Honjaman_Level_Up',
				images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/3/222295.jpg', small_image_url: 'https://cdn.myanimelist.net/images/manga/3/222295t.jpg', large_image_url: 'https://cdn.myanimelist.net/images/manga/3/222295l.jpg' } },
				titles: [{ type: 'Default', title: 'Na Honjaman Level Up' }, { type: 'English', title: 'Solo Leveling' }],
				title: 'Na Honjaman Level Up',
				title_english: 'Solo Leveling',
				title_japanese: '나 혼자만 레벨업',
				type: 'Manhwa',
				chapters: 200,
				volumes: null,
				status: 'Finished',
				published: { from: '2018-03-04T00:00:00+00:00', to: '2023-12-29T00:00:00+00:00' },
				score: 8.65,
				synopsis: 'E-rank hunter Jinwoo Sung levels up alone.\n\n[Written by MAL Rewrite]',
				authors: [{ mal_id: 1, type: 'people', name: 'Chugong' }, { mal_id: 2, type: 'people', name: 'Jang, Sung-Rak' }],
				genres: [{ mal_id: 1, type: 'manga', name: 'Action' }, { mal_id: 2, type: 'manga', name: 'Adventure' }, { mal_id: 10, type: 'manga', name: 'Fantasy' }],
			},
			{
				mal_id: 2,
				url: 'https://myanimelist.net/manga/2/Berserk',
				images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/manga/1/157897.jpg' } },
				title: 'Berserk',
				title_english: 'Berserk',
				title_japanese: 'ベルセルク',
				type: 'Manga',
				chapters: null,
				volumes: null,
				status: 'Publishing',
				published: { from: '1989-08-25T00:00:00+00:00', to: null },
				score: 9.47,
				synopsis: 'Guts, a former mercenary, is out for revenge.',
				authors: [{ mal_id: 1868, type: 'people', name: 'Miura, Kentarou' }],
				genres: [],
			},
			{ mal_id: 999, title: 'Some fan comic', type: 'Doujinshi', published: { from: '2020-01-01T00:00:00+00:00' } },
		],
	};
}
