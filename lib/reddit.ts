import type { RedditPost } from '@/types'

const MUSIC_SUBS = [
  'ifyoulikeblank',
  'indieheads',
  'hiphopheads',
  'listentothis',
  'truemusic',
  'Music',
]

interface RedditListing {
  data: {
    children: Array<{ data: { title: string; url: string; subreddit: string; score: number; selftext: string } }>
  }
}

async function fetchSubreddit(sub: string, sort: 'hot' | 'top' = 'hot', limit = 15): Promise<RedditPost[]> {
  try {
    const url = `https://www.reddit.com/r/${sub}/${sort}.json?limit=${limit}&t=week`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'tsunami-playlist-curator/1.0' },
      next: { revalidate: 1800 }, // cache 30 min
    })
    if (!res.ok) return []
    const json: RedditListing = await res.json()
    return json.data.children.map(({ data: d }) => ({
      title: d.title,
      url: d.url,
      subreddit: d.subreddit,
      score: d.score,
      selftext: d.selftext?.slice(0, 400),
    }))
  } catch {
    return []
  }
}

export async function getMusicRecommendations(): Promise<RedditPost[]> {
  const results = await Promise.all(
    MUSIC_SUBS.map((sub) => fetchSubreddit(sub, 'hot', 15))
  )
  return results
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
}

export function formatRedditContext(posts: RedditPost[]): string {
  if (posts.length === 0) return 'No Reddit data available.'
  const grouped: Record<string, RedditPost[]> = {}
  for (const p of posts) {
    if (!grouped[p.subreddit]) grouped[p.subreddit] = []
    grouped[p.subreddit].push(p)
  }
  return Object.entries(grouped)
    .map(([sub, items]) => {
      const lines = items
        .slice(0, 8)
        .map((p) => `  - ${p.title}${p.selftext ? ` | ${p.selftext.replace(/\n/g, ' ')}` : ''}`)
        .join('\n')
      return `r/${sub}:\n${lines}`
    })
    .join('\n\n')
}
