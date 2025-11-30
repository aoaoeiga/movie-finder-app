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
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

async function getPopularMovies(lang, page) {
  try {
    const url = `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

async function getTopRatedMovies(lang, page) {
  try {
    const url = `${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error:', error);
    return [];
  }
}

async function getMovieDetails(movieId, lang) {
  try {
    const url = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=${lang}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

const genreMap = {
  action: 28, adventure: 12, animation: 16, comedy: 35,
  crime: 80, drama: 18, family: 10751, fantasy: 14,
  horror: 27, mystery: 9648, romance: 10749, scifi: 878, thriller: 53
};

const langMap = {
  ja: 'ja', en: 'en', ko: 'ko', zh: 'zh', any: 'ja'
};

const mbtiPreferences = {
  INTJ: { minRating: 7.0, sortBy: 'rating' },
  INTP: { minRating: 7.0, sortBy: 'rating' },
  ENTJ: { minRating: 6.5, sortBy: 'popularity' },
  ENTP: { minRating: 6.5, sortBy: 'mixed' },
  INFJ: { minRating: 7.5, sortBy: 'rating' },
  INFP: { minRating: 7.5, sortBy: 'rating' },
  ENFJ: { minRating: 7.0, sortBy: 'mixed' },
  ENFP: { minRating: 6.5, sortBy: 'popularity' },
  ISTJ: { minRating: 6.5, sortBy: 'rating' },
  ISFJ: { minRating: 6.5, sortBy: 'popularity' },
  ESTJ: { minRating: 6.5, sortBy: 'popularity' },
  ESFJ: { minRating: 6.5, sortBy: 'popularity' },
  ISTP: { minRating: 6.5, sortBy: 'rating' },
  ISFP: { minRating: 7.0, sortBy: 'rating' },
  ESTP: { minRating: 6.0, sortBy: 'popularity' },
  ESFP: { minRating: 6.0, sortBy: 'popularity' },
  unknown: { minRating: 6.0, sortBy: 'mixed' }
};

async function findMovieFromAnswers(answers) {
  const genre = answers.genre || 'action';
  const language = langMap[answers.language] || 'ja';
  const type = answers.type || 'any';
  const award = answers.award || 'any';
  const decade = answers.decade || 'any';
  const mbti = answers.mbti || 'unknown';
  
  let fallbackLog = [];
  
  try {
    const genreId = genreMap[genre];
    const page = Math.floor(Math.random() * 3) + 1;
    let movies = await getMoviesByGenre(genreId, language, page);
    
    if (!movies || movies.length === 0) {
      movies = await getPopularMovies(language, 1);
    }
    
    // アニメ実写フィルター
    if (type !== 'any') {
      movies = movies.filter(m => {
        if (!m.genre_ids) return type === 'live';
        const isAnime = m.genre_ids.includes(16);
        return type === 'anime' ? isAnime : !isAnime;
      });
    }
    
    // 受賞作品
    if (award === 'award') {
      const top = await getTopRatedMovies(language, 1);
      const filtered = type !== 'any' ? top.filter(m => {
        if (!m.genre_ids) return type === 'live';
        const isAnime = m.genre_ids.includes(16);
        return type === 'anime' ? isAnime : !isAnime;
      }) : top;
      movies = [...filtered, ...movies];
    } else if (award === 'popular') {
      const pop = await getPopularMovies(language, 1);
      const filtered = type !== 'any' ? pop.filter(m => {
        if (!m.genre_ids) return type === 'live';
        const isAnime = m.genre_ids.includes(16);
        return type === 'anime' ? isAnime : !isAnime;
      }) : pop;
      movies = [...filtered, ...movies];
    }
    
    // 年代フィルター
    if (decade !== 'any') {
      const withDecade = movies.filter(m => {
        if (!m.release_date) return false;
        const year = new Date(m.release_date).getFullYear();
        if (decade === '1990s') return year < 2000;
        if (decade === '2000s') return year >= 2000 && year < 2010;
        if (decade === '2010s') return year >= 2010 && year < 2020;
        if (decade === '2020s') return year >= 2020;
        return true;
      });
      
      if (withDecade.length >= 3) {
        movies = withDecade;
      } else {
        fallbackLog.push('年代条件');
      }
    }
    
    // MBTIフィルター
    if (mbti !== 'unknown') {
      const pref = mbtiPreferences[mbti];
      const withMBTI = movies.filter(m => (m.vote_average || 0) >= pref.minRating);
      
      if (withMBTI.length >= 3) {
        movies = withMBTI;
      } else {
        fallbackLog.push('MBTI評価基準');
      }
    }
    
    // ソート
    const pref = mbtiPreferences[mbti] || mbtiPreferences.unknown;
    if (award === 'hidden') {
      movies.sort((a, b) => (a.popularity || 0) - (b.popularity || 0));
    } else if (pref.sortBy === 'rating') {
      movies.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    } else if (pref.sortBy === 'popularity') {
      movies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else {
      movies.sort((a, b) => {
        const scoreA = (a.vote_average || 0) * 0.5 + (a.popularity || 0) * 0.01;
        const scoreB = (b.vote_average || 0) * 0.5 + (b.popularity || 0) * 0.01;
        return scoreB - scoreA;
      });
    }
    
    let selected = null;
    if (movies.length > 0) {
      const top = movies.slice(0, Math.min(20, movies.length));
      selected = top[Math.floor(Math.random() * Math.min(top.length, 10))];
    }
    
    // 最終フォールバック
    if (!selected) {
      fallbackLog.push('その他の条件');
      const fallback = await getPopularMovies(language, 1);
      if (fallback && fallback.length > 0) {
        selected = fallback[0];
      }
    }
    
    return { movie: selected, fallbackLog };
    
  } catch (error) {
    console.error('Error:', error);
    const emergency = await getPopularMovies('ja', 1);
    return {
      movie: emergency && emergency.length > 0 ? emergency[0] : null,
      fallbackLog: ['エラーが発生しました']
    };
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
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: error.message 
    });
  }
}
