import crypto from "crypto";

// Seed base numbers representing downloads/visitors before tracking was added
const BASE_DOWNLOADS_TODAY = 1284;
const BASE_VISITORS = 4823;

export interface DownloadRecord {
  title: string;
  platform: string;
  count: number;
  lastDownloaded: number;
}

export interface Review {
  id: string;
  stars: number;
  review: string;
  platform: string;
  author: string;
  timestamp: number;
  likes: number;
  dislikes: number;
}

// Active sessions: sessionId → lastSeen ms
const activeSessions = new Map<string, number>();
// Active downloads: set of session IDs
const activeDownloads = new Set<string>();

let downloadsToday = BASE_DOWNLOADS_TODAY;
let lastResetDate = new Date().toDateString();

// Platform download counts (seeded)
const platformCounts = new Map<string, number>([
  ["YouTube", 4823],
  ["TikTok", 3241],
  ["Instagram", 2156],
  ["Facebook", 987],
  ["Twitter/X", 654],
  ["Reddit", 432],
  ["Vimeo", 321],
  ["Pinterest", 198],
  ["Other", 233],
]);

// Trending: title → DownloadRecord (deduped by title, sorted by count)
const trendingMap = new Map<string, DownloadRecord>([
  ["Viral Dance Challenge Compilation", { title: "Viral Dance Challenge Compilation", platform: "TikTok", count: 89, lastDownloaded: Date.now() - 900000 }],
  ["Top 10 Funny Moments This Week", { title: "Top 10 Funny Moments This Week", platform: "YouTube", count: 74, lastDownloaded: Date.now() - 1800000 }],
  ["Instagram Reel Workout Routine", { title: "Instagram Reel Workout Routine", platform: "Instagram", count: 61, lastDownloaded: Date.now() - 2700000 }],
  ["Epic Gaming Highlights 2024", { title: "Epic Gaming Highlights 2024", platform: "YouTube", count: 55, lastDownloaded: Date.now() - 3600000 }],
  ["Street Food Tour - NYC Edition", { title: "Street Food Tour - NYC Edition", platform: "Facebook", count: 43, lastDownloaded: Date.now() - 4500000 }],
]);

// Reviews (seeded with realistic starting reviews)
const reviews: Review[] = [
  { id: "r1", stars: 5, review: "Best video downloader I've ever used! Downloaded 50+ TikToks perfectly.", platform: "TikTok", author: "TikTok_Fan92", timestamp: Date.now() - 86400000 * 2, likes: 47, dislikes: 2 },
  { id: "r2", stars: 5, review: "Works perfectly for Instagram reels. Lightning fast with no watermark!", platform: "Instagram", author: "Reel_Saver", timestamp: Date.now() - 86400000 * 4, likes: 31, dislikes: 1 },
  { id: "r3", stars: 5, review: "YouTube 1080p downloads in seconds. H.264 format plays everywhere.", platform: "YouTube", author: "YT_Downloader", timestamp: Date.now() - 86400000 * 6, likes: 28, dislikes: 0 },
  { id: "r4", stars: 4, review: "Amazing tool! All quality options from 144p to 4K. Really useful.", platform: "YouTube", author: "OfflineViewer", timestamp: Date.now() - 86400000 * 9, likes: 19, dislikes: 1 },
  { id: "r5", stars: 4, review: "Great for Reddit videos too. Works on mobile browser perfectly.", platform: "Reddit", author: "RedditUser2024", timestamp: Date.now() - 86400000 * 12, likes: 13, dislikes: 2 },
  { id: "r6", stars: 5, review: "So simple — paste URL, pick quality, done. No signup needed!", platform: "Instagram", author: "NoSignupFan", timestamp: Date.now() - 86400000 * 15, likes: 22, dislikes: 0 },
];

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    downloadsToday = BASE_DOWNLOADS_TODAY;
    lastResetDate = today;
  }
}

function pruneOldSessions() {
  const cutoff = Date.now() - 30 * 60 * 1000; // 30 min inactivity = not "active"
  for (const [id, lastSeen] of activeSessions.entries()) {
    if (lastSeen < cutoff) activeSessions.delete(id);
  }
}

export const statsStore = {
  recordVisit(sessionId: string) {
    activeSessions.set(sessionId, Date.now());
    pruneOldSessions();
  },

  startDownload(sessionId: string) {
    activeDownloads.add(sessionId);
  },

  endDownload(sessionId: string, record?: { title: string; platform: string }) {
    activeDownloads.delete(sessionId);
    resetIfNewDay();
    downloadsToday++;
    const plat = record?.platform || "Other";
    platformCounts.set(plat, (platformCounts.get(plat) || 0) + 1);

    if (record?.title && record.title !== "Unknown") {
      const key = record.title.slice(0, 80);
      const existing = trendingMap.get(key);
      if (existing) {
        existing.count++;
        existing.lastDownloaded = Date.now();
      } else {
        trendingMap.set(key, { title: key, platform: plat, count: 1, lastDownloaded: Date.now() });
      }
      // Keep only top 50 trending
      if (trendingMap.size > 50) {
        const oldest = [...trendingMap.entries()].sort((a, b) => a[1].lastDownloaded - b[1].lastDownloaded)[0];
        trendingMap.delete(oldest[0]);
      }
    }
  },

  getStats() {
    resetIfNewDay();
    pruneOldSessions();
    const load = activeDownloads.size;
    const activeCount = Math.max(activeSessions.size, 1);
    return {
      activeUsers: activeCount,
      downloading: activeDownloads.size,
      totalToday: downloadsToday,
      dailyVisitors: BASE_VISITORS + activeSessions.size,
      serverStatus: load < 5 ? "Fast" : load < 20 ? "Normal" : "Busy",
      platformCounts: Object.fromEntries(platformCounts),
    };
  },

  getTrending() {
    return [...trendingMap.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  },

  getPlatformRanking() {
    return [...platformCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([platform, count]) => ({ platform, count }));
  },

  getRatings() {
    const sorted = [...reviews].sort((a, b) => b.timestamp - a.timestamp);
    const avg = reviews.reduce((s, r) => s + r.stars, 0) / reviews.length;
    const distribution = [5, 4, 3, 2, 1].map(s => ({
      stars: s,
      count: reviews.filter(r => r.stars === s).length,
    }));
    // Platform-wise average
    const platforms = [...new Set(reviews.map(r => r.platform))];
    const platformRatings = platforms.map(p => {
      const pReviews = reviews.filter(r => r.platform === p);
      return { platform: p, average: Math.round(pReviews.reduce((s, r) => s + r.stars, 0) / pReviews.length * 10) / 10, count: pReviews.length };
    });
    return {
      average: Math.round(avg * 10) / 10,
      count: reviews.length,
      reviews: sorted.slice(0, 20),
      distribution,
      platformRatings,
    };
  },

  addReview(data: { stars: number; review: string; platform: string; author?: string }) {
    const newReview: Review = {
      id: crypto.randomBytes(8).toString("hex"),
      stars: Math.max(1, Math.min(5, data.stars)),
      review: (data.review || "").slice(0, 500),
      platform: data.platform || "Other",
      author: (data.author || "Anonymous").slice(0, 30),
      timestamp: Date.now(),
      likes: 0,
      dislikes: 0,
    };
    reviews.unshift(newReview);
    return newReview;
  },

  reactToReview(id: string, type: "like" | "dislike") {
    const review = reviews.find(r => r.id === id);
    if (!review) return null;
    if (type === "like") review.likes++;
    else review.dislikes++;
    return review;
  },
};
