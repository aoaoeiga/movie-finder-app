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

async function getMoviesByGenre(genreId, lang = 'ja', page = 1) {
  const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&with_genres=${genreId}&page=${page}&include_adult=false&sort_by=popularity.desc`;
  const response = await fetch(url);
  const data = await response.json();
  return data.results || [];
}

async function getPopularMovies(lang = 'ja', page = 1) {
  const url = `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.results || [];
}

async function getTopRatedMovies(lang = 'ja', page = 1) {
  const url = `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.results || [];
}

async function getMovieDetails(movieId, lang = 'ja') {
  const url = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=${lang}`;
  const response = await fetch(url);
  return await response.json();
}

const genreMap = {
  action: 28, adventure: 12, animation: 16, comedy: 35,
  crime: 80, drama: 18, family: 10751, fantasy: 14,
  horror: 27, mystery: 9648, romance: 10749, scifi: 878, thriller: 53
};

const langMap = { ja: 'ja', en: 'en', ko: 'ko', zh: 'zh', any: 'ja' };

const mbtiGenreMap = {
  INTJ: [878, 9648, 53],      // SF, ミステリー, スリラー
  INTP: [878, 9648, 14],      // SF, ミステリー, ファンタジー
  ENTJ: [80, 36, 53],         // 犯罪, 歴史, スリラー
  ENTP: [35, 12, 878],        // コメディ, 冒険, SF
  INFJ: [18, 10749, 14],      // ドラマ, ロマンス, ファンタジー
  INFP: [10749, 14, 10402],   // ロマンス, ファンタジー, 音楽
  ENFJ: [18, 10749, 10751],   // ドラマ, ロマンス, 家族
  ENFP: [35, 10749, 12],      // コメディ, ロマンス, 冒険
  ISTJ: [36, 18, 80],         // 歴史, ドラマ, 犯罪
  ISFJ: [10751, 10749, 18],   // 家族, ロマンス, ドラマ
  ESTJ: [28, 80, 36],         // アクション, 犯罪, 歴史
  ESFJ: [10749, 35, 10751],   // ロマンス, コメディ, 家族
  ISTP: [28, 53, 878],        // アクション, スリラー, SF
  ISFP: [10402, 10749, 18],   // 音楽, ロマンス, ドラマ
  ESTP: [28, 12, 80],         // アクション, 冒険, 犯罪
  ESFP: [35, 10402, 10749],   // コメディ, 音楽, ロマンス
  unknown: []
};

async function findMovieFromAnswers(answers) {
  const genre = answers.genre || 'action';
  const language = langMap[answers.language] || 'ja';
  const award = answers.award || 'any';
  const decade = answers.decade || 'any';
  const mbti = answers.mbti || 'unknown';
  
  let movies = [];
  let fallbackLog = [];
  
  // MBTI考慮したジャンル選択
  let genreId = genreMap[genre];
  if (mbti && mbti !== 'unknown' && mbtiGenreMap[mbti]) {
    const mbtiGenres = mbtiGenreMap[mbti];
    const randomMbtiGenre = mbtiGenres[Math.floor(Math.random() * mbtiGenres.length)];
    if (Math.random() > 0.5) {
      genreId = randomMbtiGenre;
    }
  }
  
  // 映画取得
  if (genreId) {
    const page = Math.floor(Math.random() * 3) + 1;
    movies = await getMoviesByGenre(genreId, language, page);
  }
  
  // 受賞作品追加
  if (award === 'award') {
    const topRated = await getTopRatedMovies(language, 1);
    movies = [...topRated, ...movies];
  } else if (award === 'popular') {
    const popular = await getPopularMovies(language, 1);
    movies = [...popular, ...movies];
  }
  
  // 段階的条件緩和システム
  // 優先順位: 今の気分 → 誰と見る → 舞台 → 視聴時間 → 何年代 → どんな作品 → MBTI → ジャンル → 言語 → アニメ実写
  
  let filteredMovies = movies;
  let originalCount = movies.length;
  
  // レベル5: 年代フィルター
  if (decade !== 'any' && filteredMovies.length > 0) {
    const tempFiltered = filteredMovies.filter(movie => {
      if (!movie.release_date) return false;
      const year = new Date(movie.release_date).getFullYear();
      if (decade === '1990s') return year < 2000;
      if (decade === '2000s') return year >= 2000 && year < 2010;
      if (decade === '2010s') return year >= 2010 && year < 2020;
      if (decade === '2020s') return year >= 2020;
      return true;
    });
    
    if (tempFiltered.length === 0) {
      fallbackLog.push('年代条件（他の年代からも選択）');
    } else {
      filteredMovies = tempFiltered;
    }
  }
  
  // 最低10件確保
  if (filteredMovies.length < 10) {
    fallbackLog.push('条件の一部（より多くの候補から選択）');
    filteredMovies = movies;
  }
  
  // ソート
  if (award === 'hidden') {
    filteredMovies.sort((a, b) => a.popularity - b.popularity);
  } else {
    filteredMovies.sort((a, b) => b.popularity - a.popularity);
  }
  
  // ランダム選択
  const topMovies = filteredMovies.slice(0, 20);
  let selectedMovie = topMovies[Math.floor(Math.random() * Math.min(topMovies.length, 10))];
  
  // 最終フォールバック
  if (!selectedMovie) {
    fallbackLog.push('すべての条件（人気映画から選択）');
    const popular = await getPopularMovies(language, 1);
    selectedMovie = popular[Math.floor(Math.random() * popular.length)];
  }
  
  return {
    movie: selectedMovie,
    fallbackLog: fallbackLog
  };
}

function formatMovieData(movie, details = null) {
  return {
    title: movie.title || movie.original_title,
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
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
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
    if (!answers) return res.status(400).json({ error: '無効なリクエスト' });
    
    const result = await findMovieFromAnswers(answers);
    if (!result.movie) return res.status(404).json({ error: '映画が見つかりません' });
    
    const details = await getMovieDetails(result.movie.id, langMap[answers.language] || 'ja');
    const movieData = formatMovieData(result.movie, details);
    
    incrementCount(clientIP);
    
    return res.status(200).json({
      ...movieData,
      fallbackLog: result.fallbackLog,
      remainingCount: DAILY_LIMIT - (rateLimit.count + 1)
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'サーバーエラー',
      message: error.message 
    });
  }
}
