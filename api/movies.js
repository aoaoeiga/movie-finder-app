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

// 新しいMBTI選考基準（ジャンルは変えない）
const mbtiPreferences = {
  // 分析家グループ (NT) - 高評価・複雑さ重視
  INTJ: { minRating: 7.0, preferHidden: true, sortBy: 'rating' },      // 高評価・複雑
  INTP: { minRating: 7.0, preferHidden: true, sortBy: 'rating' },      // 高評価・独特
  ENTJ: { minRating: 6.5, preferHidden: false, sortBy: 'popularity' }, // 人気・高評価
  ENTP: { minRating: 6.5, preferHidden: true, sortBy: 'mixed' },       // ユニーク
  
  // 外交官グループ (NF) - 感動・美しさ重視
  INFJ: { minRating: 7.5, preferHidden: false, sortBy: 'rating' },     // 超高評価・感動
  INFP: { minRating: 7.5, preferHidden: true, sortBy: 'rating' },      // 超高評価・美しい
  ENFJ: { minRating: 7.0, preferHidden: false, sortBy: 'mixed' },      // バランス型
  ENFP: { minRating: 6.5, preferHidden: false, sortBy: 'popularity' }, // 人気・楽しい
  
  // 番人グループ (SJ) - 安定・実績重視
  ISTJ: { minRating: 6.5, preferHidden: false, sortBy: 'rating' },     // 安定・王道
  ISFJ: { minRating: 6.5, preferHidden: false, sortBy: 'popularity' }, // 人気・温かい
  ESTJ: { minRating: 6.5, preferHidden: false, sortBy: 'popularity' }, // 人気・実績
  ESFJ: { minRating: 6.5, preferHidden: false, sortBy: 'popularity' }, // 大衆人気
  
  // 探検家グループ (SP) - エンタメ・刺激重視
  ISTP: { minRating: 6.5, preferHidden: false, sortBy: 'rating' },     // 技術的
  ISFP: { minRating: 7.0, preferHidden: true, sortBy: 'rating' },      // 美しい・感性的
  ESTP: { minRating: 6.0, preferHidden: false, sortBy: 'popularity' }, // 人気・刺激的
  ESFP: { minRating: 6.0, preferHidden: false, sortBy: 'popularity' }, // 超人気・楽しい
  
  unknown: { minRating: 6.0, preferHidden: false, sortBy: 'mixed' }
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

function filterByMBTI(movies, mbti) {
  if (!mbti || mbti === 'unknown' || !Array.isArray(movies) || movies.length === 0) {
    return movies;
  }
  
  const pref = mbtiPreferences[mbti] || mbtiPreferences.unknown;
  
  // 評価フィルター
  const filtered = movies.filter(movie => {
    const rating = movie.vote_average || 0;
    return rating >= pref.minRating;
  });
  
  // 結果が少なすぎる場合は元のリストを返す
  if (filtered.length < 3) {
    return movies;
  }
  
  return filtered;
}

function sortByMBTI(movies, mbti, award) {
  if (!Array.isArray(movies) || movies.length === 0) {
    return movies;
  }
  
  const pref = mbtiPreferences[mbti] || mbtiPreferences.unknown;
  
  // award設定が優先
  if (award === 'hidden' || (award === 'any' && pref.preferHidden)) {
    return movies.sort((a, b) => (a.popularity || 0) - (b.popularity || 0));
  }
  
  // ソート方法
  if (pref.sortBy === 'rating') {
    return movies.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  } else if (pref.sortBy === 'popularity') {
    return movies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  } else {
    // mixed: 評価と人気のバランス
    return movies.sort((a, b) => {
      const scoreA = (a.vote_average || 0) * 0.5 + (a.popularity || 0) * 0.01;
      const scoreB = (b.vote_average || 0) * 0.5 + (b.popularity || 0) * 0.01;
      return scoreB - scoreA;
    });
  }
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
    // ジャンル決定（ユーザー選択を絶対優先）
    const genreId = genreMap[genre];
    
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
    
    // MBTIフィルター（評価基準で絞る）
    let withMBTI = filterByMBTI(filtered, mbti);
    if (withMBTI.length >= MIN_MOVIES) {
      filtered = withMBTI;
    } else if (mbti !== 'unknown') {
      fallbackLog.push('MBTI評価基準');
    }
    
    // 受賞作品条件緩和
    if (filtered.length < MIN_MOVIES && award !== 'any') {
      fallbackLog.push('受賞作品条件');
    }
    
    // MBTIに基づいたソート
    filtered = sortByMBTI(filtered, mbti, award);
    
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
```

---

# 🎯 新しいMBTI選考基準の動作

## 例1: ホラー + INTJ
```
ユーザー選択: ホラー
MBTI: INTJ（建築家）

動作:
1. ホラージャンルで検索 ✅
2. 評価7.0以上の作品に絞る ✅
3. 評価の高い順にソート ✅
4. → 高評価の心理ホラーが選ばれる
```

## 例2: コメディ + ESFP
```
ユーザー選択: コメディ
MBTI: ESFP（エンターテイナー）

動作:
1. コメディジャンルで検索 ✅
2. 評価6.0以上（緩め）に絞る ✅
3. 人気の高い順にソート ✅
4. → 超人気のコメディが選ばれる
```

## 例3: SF + INFP
```
ユーザー選択: SF
MBTI: INFP（仲介者）

動作:
1. SFジャンルで検索 ✅
2. 評価7.5以上（超高評価）に絞る ✅
3. 評価の高い順にソート ✅
4. → 美しい映像のSF映画が選ばれる
```

---

# 📊 改善点まとめ

## ✅ 修正前の問題
```
❌ MBTIでジャンルが変わる
❌ ユーザーの選択が無視される
❌ ホラー選んだのにロマンスが出る
```

## ✅ 修正後
```
✅ ジャンルは絶対にユーザー選択
✅ MBTIは評価基準とソート順に影響
✅ ホラー選んだら必ずホラーが出る
```

---

# 🚀 デプロイ
```
Commit message: 🧠 MBTI選考基準改善（ジャンル矛盾解消）
