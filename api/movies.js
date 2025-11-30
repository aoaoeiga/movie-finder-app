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
    return await response.json();
  } catch (error) {
    console.error('Error fetching movie details:', error);
    return null;
  }
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
  const genre = answers.genre || 'action';
  const language = langMap[answers.language] || 'ja';
  const award = answers.award || 'any';
  const decade = answers.decade || 'any';
  const mbti = answers.mbti || 'unknown';
  
  let fallbackLog = [];
  let movies = [];
  
  try {
    let genreId = genreMap[genre];
    if (mbti && mbti !== 'unknown' && mbtiGenreMap[mbti]) {
      const mbtiGenres = mbtiGenreMap[mbti];
      const randomMbtiGenre = mbtiGenres[Math.floor(Math.random() * mbtiGenres.length)];
      if (Math.random() > 0.5) {
        genreId = randomMbtiGenre;
      }
    }
    
    if (genreId) {
      const page = Math.floor(Math.random() * 3) + 1;
      movies = await getMoviesByGenre(genreId, language, page);
    } else {
      movies = await getPopularMovies(language, 1);
    }
    
    if (award === 'award') {
      const topRated = await getTopRatedMovies(language, 1);
      movies = [...topRated, ...movies];
    } else if (award === 'popular') {
      const popular = await getPopularMovies(language, 1);
      movies = [...popular, ...movies];
    }
    
    let filteredMovies = movies;
    const MIN_MOVIES = 5;
    
    if (decade !== 'any' && movies.length > 0) {
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
      } else {
        filteredMovies = tempFiltered;
      }
    }
    
    if (filteredMovies.length < MIN_MOVIES && filteredMovies.length < movies.length) {
      fallbackLog.push('一部の条件');
      filteredMovies = movies;
    }
    
    if (filteredMovies.length > 0) {
      if (award === 'hidden') {
        filteredMovies.sort((a, b) => a.popularity - b.popularity);
      } else {
        filteredMovies.sort((a, b) => b.popularity - a.popularity);
      }
    }
    
    const topMovies = filteredMovies.slice(0, 20);
    let selectedMovie = null;
    
    if (topMovies.length > 0) {
      selectedMovie = topMovies[Math.floor(Math.random() * Math.min(topMovies.length, 10))];
    }
    
    if (!selectedMovie) {
      fallbackLog.push('すべての条件');
      const popular = await getPopularMovies(language, 1);
      if (popular.length > 0) {
        selectedMovie = popular[Math.floor(Math.random() * popular.length)];
      }
    }
    
    return {
      movie: selectedMovie,
      fallbackLog: fallbackLog
    };
  } catch (error) {
    console.error('Error in findMovieFromAnswers:', error);
    const popular = await getPopularMovies('ja', 1);
    return {
      movie: popular[0] || null,
      fallbackLog: ['すべての条件（エラー発生）']
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
    
    if (!result.movie) {
      return res.status(404).json({ error: '映画が見つかりません' });
    }
    
    const language = langMap[answers.language] || 'ja';
    const details = await getMovieDetails(result.movie.id, language);
    const movieData = formatMovieData(result.movie, details);
    
    if (!movieData) {
      return res.status(404).json({ error: '映画データの取得に失敗しました' });
    }
    
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
