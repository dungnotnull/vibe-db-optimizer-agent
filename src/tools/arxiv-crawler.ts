import type { Paper } from '../types/index.js';

const ARXIV_API_BASE = 'https://export.arxiv.org/api/query';
const RELEVANCE_KEYWORDS = [
  'database', 'query optimization', 'index', 'postgresql', 'mysql',
  'sharding', 'partitioning', 'cardinality estimation', 'cost model',
  'learned index', 'query plan', 'execution plan', 'oltp', 'olap',
  'buffer pool', 'btree', 'concurrency control', 'storage engine',
  'query processing', 'join algorithm', 'materialized view',
];

export async function crawlArxiv(daysBack = 7, maxResults = 20): Promise<Paper[]> {
  try {
    const query = encodeURIComponent(
      `(cat:cs.DB OR cat:cs.IR) AND (${RELEVANCE_KEYWORDS.slice(0, 5).join('+OR+')})`,
    );
    const url = `${ARXIV_API_BASE}?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) return [];
      const xml = await response.text();
      return parseArxivXml(xml, daysBack);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return [];
  }
}

function parseArxivXml(xml: string, daysBack: number): Paper[] {
  const papers: Paper[] = [];
  const entries = xml.split('<entry>').slice(1);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  for (const entry of entries) {
    try {
      const title = extractXmlTag(entry, 'title');
      const abstract = extractXmlTag(entry, 'summary');
      const url = extractXmlTag(entry, 'id');
      const publishedStr = extractXmlTag(entry, 'published');
      const published = new Date(publishedStr);
      const authorEntries = entry.match(/<author>[\s\S]*?<\/author>/g) ?? [];
      const authors = authorEntries.map((a) => extractXmlTag(a, 'name'));
      const categoryMatches = entry.match(/<category term="([^"]+)"/g) ?? [];
      const categories = categoryMatches.map((c) => c.match(/term="([^"]+)"/)?.[1] ?? '').filter(Boolean);

      if (published < cutoff) continue;
      if (!title) continue;

      const relevanceScore = computeRelevance(abstract);

      papers.push({
        title: title.replace(/\s+/g, ' ').trim(),
        authors: authors.length > 0 ? authors : ['Unknown'],
        abstract: abstract.replace(/\s+/g, ' ').trim().slice(0, 1000),
        url,
        published,
        categories,
      });
    } catch {
      continue;
    }
  }

  return papers;
}

function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's');
  const match = xml.match(regex);
  return match?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
}

function computeRelevance(text: string): number {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of RELEVANCE_KEYWORDS) {
    if (lower.includes(kw)) matches++;
  }
  return Math.min(matches / 5, 1.0);
}

export async function crawlVldb(): Promise<Paper[]> {
  try {
    const url = 'https://vldb.org/pvldb/volumes/';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let html: string;
    try {
      const resp = await fetch(url, { signal: controller.signal });
      html = await resp.text();
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }

    const papers: Paper[] = [];
    const volLinks = html.match(/<a[^>]*href="([^"]*vol[^"]*)"[^>]*>/gi) ?? [];

    for (const link of volLinks.slice(0, 2)) {
      const volUrl = link.match(/href="([^"]+)"/i)?.[1];
      if (!volUrl) continue;
      const absUrl = volUrl.startsWith('http') ? volUrl : `https://vldb.org/pvldb/${volUrl}`;

      try {
        const volResp = await fetch(absUrl);
        const volHtml = await volResp.text();
        const paperLinks = volHtml.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi) ?? [];

        for (const pLink of paperLinks.slice(0, 10)) {
          const href = pLink.match(/href="([^"]+)"/i)?.[1];
          const titleText = pLink.match(/>([^<]+)<\/a>/i)?.[1];
          if (!href || !titleText || titleText.length < 20) continue;
          const relevant = RELEVANCE_KEYWORDS.some((kw) =>
            titleText.toLowerCase().includes(kw),
          );
          if (!relevant) continue;

          papers.push({
            title: titleText.trim(),
            authors: ['VLDB Authors'],
            abstract: '',
            url: href.startsWith('http') ? href : `https://vldb.org/pvldb/${href}`,
            published: new Date(),
            categories: ['cs.DB'],
          });
        }
      } catch {
        continue;
      }
    }

    return papers.slice(0, 10);
  } catch {
    return [];
  }
}

export async function crawlPgDocs(): Promise<Paper[]> {
  const topics = ['indexes.html', 'using-explain.html', 'performance-tips.html', 'ddl-partitioning.html'];
  const papers: Paper[] = [];

  for (const topic of topics) {
    try {
      const url = `https://www.postgresql.org/docs/current/${topic}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;

      papers.push({
        title: `PostgreSQL Official Docs: ${topic.replace('.html', '').replace(/-/g, ' ')}`,
        authors: ['PostgreSQL Global Development Group'],
        abstract: `Latest PostgreSQL documentation on ${topic}`,
        url,
        published: new Date(),
        categories: ['documentation', 'postgresql'],
      });
    } catch {
      continue;
    }
  }

  return papers;
}
