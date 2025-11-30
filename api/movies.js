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
    userData = {
      count: 0,
      resetTime: tomorrow
    };
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
  if (userData) {
    userData.count++;
  }
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

async function findMovieFromAnswers(answers) {
  const genre = answers.genre || 'action';
  const language = langMap[answers.language] || 'ja';
  const award = answers.award || 'any';
  const decade = answers.decade || 'any';
  
  let movies = [];
  
  const genreId = genreMap[genre];
  if (genreId) {
    const page = Math.floor(Math.random() * 3) + 1;
    movies = await getMoviesByGenre(genreId, language, page);
  }
  
  if (award === 'award') {
    const topRated = await getTopRatedMovies(language, 1);
    movies = [...topRated, ...movies];
  } else if (award === 'popular') {
    const popular = await getPopularMovies(language, 1);
    movies = [...popular, ...movies];
  }
  
  if (decade !== 'any' && movies.length > 0) {
    movies = movies.filter(movie => {
      const year = new Date(movie.release_date).getFullYear();
      if (decade === '1990s') return year < 2000;
      if (decade === '2000s') return year >= 2000 && year < 2010;
      if (decade === '2010s') return year >= 2010 && year < 2020;
      if (decade === '2020s') return year >= 2020;
      return true;
    });
  }
  
  if (award === 'hidden' && movies.length > 0) {
    movies.sort((a, b) => a.popularity - b.popularity);
  } else {
    movies.sort((a, b) => b.popularity - a.popularity);
  }
  
  const topMovies = movies.slice(0, 20);
  const selectedMovie = topMovies[Math.floor(Math.random() * Math.min(topMovies.length, 10))];
  
  if (!selectedMovie) {
    const popular = await getPopularMovies(language, 1);
    return popular[Math.floor(Math.random() * popular.length)];
  }
  
  return selectedMovie;
}

function formatMovieData(movie, details = null) {
  const posterPath = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
    : 'https://via.placeholder.com/500x750?text=No+Poster';
  
  const year = movie.release_date 
    ? new Date(movie.release_date).getFullYear() 
    : '不明';
  
  const rating = movie.vote_average 
    ? movie.vote_average.toFixed(1) 
    : 'N/A';
  
  const runtime = details?.runtime || 120;
  const genres = details?.genres?.map(g => g.name).join(' / ') || '不明';
  
  return {
    title: movie.title || movie.original_title,
    poster: posterPath,
    desc: movie.overview || '説明がありません',
    year: year,
    rating: rating,
    runtime: runtime,
    genres: genres,
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
        error: `本日の診断回数が上限(${DAILY_LIMIT}回)に達しました。\n次回リセット: 明日 0:00`,
        resetTime: rateLimit.resetTime,
        count: rateLimit.count,
        limit: DAILY_LIMIT
      });
    }
    
    const { answers } = req.body;
    
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: '無効なリクエストです' });
    }
    
    const selectedMovie = await findMovieFromAnswers(answers);
    
    if (!selectedMovie) {
      return res.status(404).json({ error: '映画が見つかりませんでした' });
    }
    
    const details = await getMovieDetails(selectedMovie.id, langMap[answers.language] || 'ja');
    const movieData = formatMovieData(selectedMovie, details);
    
    incrementCount(clientIP);
    
    return res.status(200).json({
      ...movieData,
      remainingCount: DAILY_LIMIT - (rateLimit.count + 1)
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'サーバーエラーが発生しました',
      message: error.message 
    });
  }
}
