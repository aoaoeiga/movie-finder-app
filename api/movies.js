const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DAILY_LIMIT = 3;
const ONE_DAY = 86400000;

if (!global.requestCounts) {
  global.requestCounts = new Map();
}

function cleanupOldData() {
  const now = Date.now();
  for (const [ip, data] of global.requestCounts.entries()) {
    if (data.resetTime < now) {
      global.requestCounts.delete(ip);
    }
  }
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection.remoteAddress || 
         'unknown';
}

function checkRateLimit(ip) {
  cleanupOldData();
  const today = new Date().setHours(0, 0, 0, 0);
  const tomorrow = today + ONE_DAY;
  let userData = global.requestCounts.get(ip);
  if (!userData || userData.resetTime <= Date.now()) {
    userData = { count: 0, resetTime: tomorrow };
    global.requestCounts.set(ip, userData);
  }
  return {
    count: userData.count,
    canUse: userData.count < DAILY_LIMIT,
    resetTime: userData.resetTime
  };
}

function incrementCount(ip) {
  const userData = global.requestCounts.get(ip);
  if (userData) userData.count++;
}

async function getMoviesByGenre(genreId, lang, page) {
  try {
    const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&with_genres=${genreId}&page=${page}&include_adult=false&sort_by=popularity.desc`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API request failed');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching movies by genre:', error);
    return [];
  }
}

async function getPopularMovies(lang, page) {
  try {
    const url = `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API request failed');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching popular movies:', error);
    return [];
  }
}

async function getTopRatedMovies(lang, page) {
  try {
    const url = `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API request failed');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching top rated movies:', error);
    return [];
  }
}

async function getMovieDetails(movieId, lang) {
  try {
    const url = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=${lang}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API request failed');
    return await response.json();
  } catch (error) {
    console.error('Error fetching movie details:', error);
    return null;
  }
}

const genreMap = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  drama: 18,
  family: 10751,
  fantasy: 14,
  horror: 27,
  mystery: 9648,
  romance: 10749,
  scifi: 878,
  thriller: 53
};

const langMap = {
  ja: 'ja',
  en: 'en',
  ko: 'ko',
  zh: 'zh',
  any: 'ja'
};

const mbtiGenreMap = {
  INTJ: [878, 9648, 53],
  INTP: [878, 9648, 14],
  ENTJ: [80, 36, 53],
  ENTP: [35, 12, 878],
  INFJ: [18, 10749, 14],
  INFP: [10749, 14, 10402],
  ENFJ: [18, 10749, 10751],
  ENFP: [35, 10749, 12],
  ISTJ: [36, 18, 80],
  ISFJ: [10751, 10749, 18],
  ESTJ: [28, 80, 36],
  ESFJ: [10749, 35, 10751],
  ISTP: [28, 53, 878],
  ISFP: [10402, 10749, 18],
  ESTP: [28, 12, 80],
  ESFP: [35, 10402, 10749],
  unknown: []
};

function filterByType(movies, type) {
  if (!type || type === 'any' || !Array.isArray(movies)) {
    return movies;
  }
  
  return movies.filter(movie => {
    if (!movie.genre_ids || !Array.isArray(movie.genre_ids)) {
      return type === 'live';
    }
    const isAnimation = movie.genre_ids.includes(16);
    return type === 'anime' ? isAnimation : !isAnimation;
  });
}

function filterByDecade(movies, decade) {
  if (!decade || decade === 'any' || !Array.isArray(movies)) {
    return movies;
  }
  
  return movies.filter(movie => {
    if (!movie.release_date) return false;
    try {
      const year = new Date(movie.release_date).getFullYear();
      if (decade === '1990s') return year < 2000;
      if (decade === '2000s') return year >= 2000 && year < 2010;
      if (decade === '2010s') return year >= 2010 && year < 2020;
      if (decade === '2020s') return year >= 2020;
      return true;
    } catch (e) {
      return false;
    }
  });
}

async function findMovieFromAnswers(answers) {
  const genre = answers.genre || 'action';
  const language = langMap[answers.language] || 'ja';
  const type = answers.type || 'any';
  const award = answers.award || 'any';
  const decade = answers.decade || 'any';
  const mbti = answers.mbti || 'unknown';
  
  let fallbackLog = [];
  const MIN_MOVIES = 3;
  
  try {
    // ジャンル決定（MBTI考慮）
    let genreId = genreMap[genre];
    let usedMbti = false;
    
    if (mbti !== 'unknown' && mbtiGenreMap[mbti] && Math.random() > 0.5) {
      const mbtiGenres = mbtiGenreMap[mbti];
      genreId = mbtiGenres[Math.floor(Math.random() * mbtiGenres.length)];
      usedMbti = true;
    }
    
    // 基本映画取得（言語とジャンルで検索）
    const page = Math.floor(Math.random() * 3) + 1;
    let movies = await getMoviesByGenre(genreId, language, page);
    
    if (!movies || movies.length === 0) {
      movies = await getPopularMovies(language, 1);
    }
    
    // アニメ実写フィルター（絶対固定）
    let filtered = filterByType(movies, type);
    
    // 受賞作品追加
    if (award === 'award') {
      const topRated = await getTopRatedMovies(language, 1);
      const topFiltered = filterByType(topRated, type);
      filtered = [...topFiltered, ...filtered];
    } else if (award === 'popular') {
      const popular = await getPopularMovies(language, 1);
      const popFiltered = filterByType(popular, type);
      filtered = [...popFiltered, ...filtered];
    }
    
    // 年代フィルター（緩和可能）
    let withDecade = filterByDecade(filtered, decade);
    if (withDecade.length >= MIN_MOVIES) {
      filtered = withDecade;
    } else if (decade !== 'any') {
      fallbackLog.push('年代条件');
    }
    
    // MBTI条件緩和
    if (filtered.length < MIN_MOVIES && usedMbti) {
      fallbackLog.push('MBTI推奨条件');
      genreId = genreMap[genre];
      movies = await getMoviesByGenre(genreId, language, page);
      filtered = filterByType(movies, type);
      
      withDecade = filterByDecade(filtered, decade);
      if (withDecade.length >= MIN_MOVIES) {
        filtered = withDecade;
      }
    }
    
    // 受賞作品条件緩和
    if (filtered.length < MIN_MOVIES && award !== 'any') {
      fallbackLog.push('受賞作品条件');
    }
    
    // ソート
    if (award === 'hidden') {
      filtered.sort((a, b) => (a.popularity || 0) - (b.popularity || 0));
    } else {
      filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    }
    
    // ランダム選択
    let selectedMovie = null;
    if (filtered.length > 0) {
      const topMovies = filtered.slice(0, Math.min(20, filtered.length));
      const randomIndex = Math.floor(Math.random() * Math.min(topMovies.length, 10));
      selectedMovie = topMovies[randomIndex];
    }
    
    // 最終フォールバック（言語・ジャンル・アニメ実写固定）
    if (!selectedMovie) {
      fallbackLog.push('その他の条件');
      const fallbackMovies = await getPopularMovies(language, 1);
      let fallbackFiltered = filterByType(fallbackMovies, type);
      
      // ジャンルで絞る
      if (genreId) {
        const genreFiltered = fallbackFiltered.filter(m => 
          m.genre_ids && m.genre_ids.includes(genreId)
        );
        if (genreFiltered.length > 0) {
          fallbackFiltered = genreFiltered;
        }
      }
      
      if (fallbackFiltered.length > 0) {
        selectedMovie = fallbackFiltered[0];
      } else if (fallbackMovies.length > 0) {
        selectedMovie = fallbackMovies[0];
      }
    }
    
    return {
      movie: selectedMovie,
      fallbackLog: fallbackLog
    };
    
  } catch (error) {
    console.error('Error in findMovieFromAnswers:', error);
    try {
      const emergencyMovies = await getPopularMovies('ja', 1);
      return {
        movie: emergencyMovies[0] || null,
        fallbackLog: ['エラーが発生しました']
      };
    } catch (e) {
      return {
        movie: null,
        fallbackLog: ['エラーが発生しました']
      };
    }
  }
}

function formatMovieData(movie, details) {
  if (!movie) return null;
  
  return {
    title: movie.title || movie.original_title || '不明',
    poster: movie.poster_path 
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : 'https://via.placeholder.com/500x750?text=No+Poster',
    desc: movie.overview || '説明がありません',
    year: movie.release_date ? new Date(movie.release_date).getFullYear() : '不明',
    rating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
    runtime: details?.runtime || 120,
    genres: details?.genres?.map(g => g.name).join(' / ') || '不明',
    tmdbId: movie.id
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const clientIP = getClientIP(req);
    const rateLimit = checkRateLimit(clientIP);
    
    if (!rateLimit.canUse) {
      return res.status(429).json({ 
        error: `本日の診断回数が上限(${DAILY_LIMIT}回)に達しました。`,
        resetTime: rateLimit.resetTime
      });
    }
    
    const { answers } = req.body;
    if (!answers) {
      return res.status(400).json({ error: '無効なリクエスト' });
    }
    
    const result = await findMovieFromAnswers(answers);
    
    if (!result || !result.movie) {
      return res.status(404).json({ error: '映画が見つかりませんでした' });
    }
    
    const language = langMap[answers.language] || 'ja';
    const details = await getMovieDetails(result.movie.id, language);
    const movieData = formatMovieData(result.movie, details);
    
    if (!movieData) {
      return res.status(500).json({ error: '映画データの処理に失敗しました' });
    }
    
    incrementCount(clientIP);
    
    return res.status(200).json({
      ...movieData,
      fallbackLog: result.fallbackLog || [],
      remainingCount: DAILY_LIMIT - (rateLimit.count + 1)
    });
    
  } catch (error) {
    console.error('API Handler Error:', error);
    return res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: error.message 
    });
  }
}
