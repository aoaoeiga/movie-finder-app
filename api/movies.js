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

async function findMovieFromAnswers(answers) {
  // ユーザーの回答を取得
  const originalAnswers = { ...answers };
  const genre = answers.genre || 'action';
  const language = langMap[answers.language] || 'ja';
  const award = answers.award || 'any';
  const decade = answers.decade || 'any';
  const mbti = answers.mbti || 'unknown';
  const mood = answers.mood || 'any';
  const withWho = answers.with || 'any';
  const setting = answers.setting || 'any';
  const runtime = answers.runtime || 'any';
  const type = answers.type || 'any';
  
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
  
  // 基本映画取得
  if (genreId) {
    const page = Math.floor(Math.random() * 3) + 1;
    var movies = await getMoviesByGenre(genreId, language, page);
  } else {
    var movies = await getPopularMovies(language, 1);
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
  // 優先順位（先に緩和する順）: 今の気分 → 誰と見る → 舞台 → 視聴時間 → 何年代 → どんな作品 → MBTI → ジャンル → 言語 → アニメ実写
  
  let filteredMovies = movies;
  const MIN_MOVIES = 5; // 最低5件は確保
  
  // レベル1: 全条件適用（年代のみ実装、他はTMDB APIの制限で困難）
  let useMoodFilter = false;    // 現在未実装
  let useWithFilter = false;    // 現在未実装
  let useSettingFilter = false; // 現在未実装
  let useRuntimeFilter = false; // 現在未実装
  let useDecadeFilter = true;   // 実装済み
  let useAwardFilter = true;    // 実装済み
  let useMbtiFilter = true;     // 実装済み
  
  // 年代フィルター（条件5）
  if (useDecadeFilter && decade !== 'any') {
    const tempFiltered = filteredMovies.filter(movie => {
      if (!movie.release_date) return false;
      const year = new Date(movie.release_date).getFullYear();
      if (decade === '1990s') return year < 2000;
      if (decade === '2000s') return year >= 2000 && year < 2010;
      if (decade === '2010s') return year >= 2010 && year < 2020;
      if (decade === '2020s') return year >= 2020;
      return true;
    });
    
    if (tempFiltered.length < MIN_MOVIES) {
      fallbackLog.push('年代条件');
      useDecadeFilter = false;
    } else {
      filteredMovies = tempFiltered;
    }
  }
  
  // まだ足りない場合、元のリストを使用
  if (filteredMovies.length < MIN_MOVIES) {
    if (filteredMovies.length < movies.length) {
      fallbackLog.push('一部の条件');
