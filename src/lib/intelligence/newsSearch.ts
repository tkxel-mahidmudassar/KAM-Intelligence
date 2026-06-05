/**
 * Public intelligence gathering — scrapes free public RSS/JSON sources
 * to fetch recent news, Reddit mentions, and financial news for an account.
 *
 * Sources:
 *   • Google News RSS  — aggregates NYT, Reuters, Bloomberg, MSN, BBC etc.
 *   • Reddit JSON      — community sentiment and mentions
 *   • Yahoo Finance RSS — financial and business news
 *   • Business Recorder RSS — markets and finance
 */

export interface NewsItem {
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string;
}

const FETCH_TIMEOUT_MS = 8000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

/** Pull text out of an XML tag — minimal parser, no dependencies */
function extractXmlTags(xml: string, tag: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
  }
  return results;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(str: string): string {
  return decodeHtmlEntities(str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

// ─── Google News RSS ──────────────────────────────────────────────────────────

async function fetchGoogleNews(query: string, maxItems = 5): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = extractXmlTags(xml, "item");
    return items.slice(0, maxItems).map((item) => {
      const title  = stripHtml(extractXmlTags(item, "title")[0]  ?? "");
      const desc   = stripHtml(extractXmlTags(item, "description")[0] ?? "");
      const link   = extractXmlTags(item, "link")[0] ?? "";
      const pubDate= extractXmlTags(item, "pubDate")[0] ?? "";
      // Source name is embedded in Google's title as " - Source"
      const parts  = title.split(" - ");
      const source = parts.length > 1 ? parts[parts.length - 1] : "Google News";
      const cleanTitle = parts.length > 1 ? parts.slice(0, -1).join(" - ") : title;
      return { title: cleanTitle, snippet: desc.slice(0, 300), url: link, source, publishedAt: pubDate };
    }).filter((n) => n.title.length > 5);
  } catch {
    return [];
  }
}

// ─── Reddit JSON search ───────────────────────────────────────────────────────

async function fetchReddit(query: string, maxItems = 4): Promise<NewsItem[]> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${maxItems}&type=link`;
    const res  = await fetchWithTimeout(url, {
      headers: { "User-Agent": "KAMIntelligence/1.0 (POC research tool)" },
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { children?: { data: { title: string; selftext: string; url: string; subreddit: string; created_utc: number } }[] } };
    return (json?.data?.children ?? []).map(({ data: p }) => ({
      title:       p.title,
      snippet:     p.selftext ? p.selftext.slice(0, 300) : `Reddit post in r/${p.subreddit}`,
      url:         p.url,
      source:      `Reddit / r/${p.subreddit}`,
      publishedAt: new Date(p.created_utc * 1000).toUTCString(),
    }));
  } catch {
    return [];
  }
}

// ─── Yahoo Finance RSS ────────────────────────────────────────────────────────

async function fetchYahooFinanceNews(query: string, maxItems = 4): Promise<NewsItem[]> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(query)}&region=US&lang=en-US`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = extractXmlTags(xml, "item");
    return items.slice(0, maxItems).map((item) => ({
      title:       stripHtml(extractXmlTags(item, "title")[0]       ?? ""),
      snippet:     stripHtml(extractXmlTags(item, "description")[0] ?? "").slice(0, 300),
      url:         extractXmlTags(item, "link")[0] ?? "",
      source:      "Yahoo Finance",
      publishedAt: extractXmlTags(item, "pubDate")[0] ?? "",
    })).filter((n) => n.title.length > 5);
  } catch {
    return [];
  }
}

// ─── Business Recorder RSS ────────────────────────────────────────────────────

async function fetchBusinessRecorder(query: string, maxItems = 3): Promise<NewsItem[]> {
  try {
    const url = `https://www.brecorder.com/feeds/latest?q=${encodeURIComponent(query)}`;
    const res  = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = extractXmlTags(xml, "item");
    return items
      .filter((item) => {
        const title = stripHtml(extractXmlTags(item, "title")[0] ?? "").toLowerCase();
        return title.includes(query.toLowerCase().split(" ")[0]);
      })
      .slice(0, maxItems)
      .map((item) => ({
        title:       stripHtml(extractXmlTags(item, "title")[0]       ?? ""),
        snippet:     stripHtml(extractXmlTags(item, "description")[0] ?? "").slice(0, 300),
        url:         extractXmlTags(item, "link")[0] ?? "",
        source:      "Business Recorder",
        publishedAt: extractXmlTags(item, "pubDate")[0] ?? "",
      })).filter((n) => n.title.length > 5);
  } catch {
    return [];
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Gather public intelligence for a company from multiple sources in parallel.
 * Searches by company name first, then by industry as a fallback/supplement.
 */
export async function gatherPublicIntelligence(
  companyName: string,
  industry: string,
): Promise<NewsItem[]> {
  const companyQuery  = companyName;
  const industryQuery = `${industry} industry trends`;

  const [googleCompany, googleIndustry, reddit, yahooFinance, bizRecorder] = await Promise.all([
    fetchGoogleNews(companyQuery,  6),
    fetchGoogleNews(industryQuery, 3),
    fetchReddit(companyQuery,      4),
    fetchYahooFinanceNews(companyQuery, 3),
    fetchBusinessRecorder(companyQuery, 2),
  ]);

  // Merge + deduplicate by title similarity
  const all = [
    ...googleCompany,
    ...reddit,
    ...yahooFinance,
    ...bizRecorder,
    ...googleIndustry,  // industry news at the end — lower priority
  ];

  const seen = new Set<string>();
  return all.filter((item) => {
    const key = item.title.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20); // cap at 20 items per account
}

/** Format news items for inclusion in an LLM prompt */
export function formatNewsForPrompt(items: NewsItem[]): string {
  if (items.length === 0) {
    return "No recent public news found for this company. Base analysis on internal account data only.";
  }
  return items.map((item, i) =>
    `[${i + 1}] ${item.source} — ${item.title}\n    ${item.snippet || "(no snippet)"}`
  ).join("\n\n");
}
