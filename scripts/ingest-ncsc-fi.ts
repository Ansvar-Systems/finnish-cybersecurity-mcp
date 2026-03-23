#!/usr/bin/env npx tsx
/**
 * Ingestion crawler for NCSC-FI (Kyberturvallisuuskeskus / Traficom) content.
 *
 * Crawls three content streams from kyberturvallisuuskeskus.fi:
 *   1. Vulnerability advisories  (RSS feed /feed/rss/fi/400 + detail pages)
 *   2. Alerts / warnings         (RSS feed /feed/rss/fi/401 + detail pages)
 *   3. News & guidance articles   (RSS feed /feed/rss/fi   + detail pages)
 *   4. Guide listing pages        (org + professional + individual guides)
 *
 * Populates the advisories, guidance, and frameworks tables defined in src/db.ts.
 *
 * Usage:
 *   npx tsx scripts/ingest-ncsc-fi.ts
 *   npx tsx scripts/ingest-ncsc-fi.ts --dry-run    # fetch & parse, don't write DB
 *   npx tsx scripts/ingest-ncsc-fi.ts --resume      # skip already-ingested references
 *   npx tsx scripts/ingest-ncsc-fi.ts --force       # drop existing data and re-ingest
 *   npx tsx scripts/ingest-ncsc-fi.ts --feed=vulns   # only vulnerability feed
 *   npx tsx scripts/ingest-ncsc-fi.ts --feed=alerts   # only alerts feed
 *   npx tsx scripts/ingest-ncsc-fi.ts --feed=news     # only news/guidance feed
 *   npx tsx scripts/ingest-ncsc-fi.ts --feed=guides   # only guide listing pages
 */

import Database from "better-sqlite3";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "../src/db.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DB_PATH = process.env["NCSC_FI_DB_PATH"] ?? "data/ncsc_fi.db";
const RATE_LIMIT_MS = 1500;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;

const BASE_URL = "https://www.kyberturvallisuuskeskus.fi";

const RSS_FEEDS = {
  vulns: `${BASE_URL}/feed/rss/fi/400`,
  alerts: `${BASE_URL}/feed/rss/fi/401`,
  news: `${BASE_URL}/feed/rss/fi`,
} as const;

const GUIDE_LISTING_PAGES = [
  `${BASE_URL}/fi/ajankohtaista/ohjeet-ja-oppaat/ohjeet-ja-oppaat-organisaatioille-ja-yrityksille`,
  `${BASE_URL}/fi/ajankohtaista/ohjeet-ja-oppaat/ohjeet-ja-oppaat-tietoturva-ammattilaisille`,
  `${BASE_URL}/fi/ajankohtaista/ohjeet-ja-oppaat/ohjeet-ja-oppaat-yksityishenkiloille`,
] as const;

// Patterns that identify vulnerability advisories by URL
const VULN_URL_PATTERNS = [
  /\/fi\/haavoittuvuus[_-]/,
  /\/fi\/kriittis/,
  /\/fi\/haavoittuvuuksia-/,
  /\/en\/haavoittuvuus[_-]/,
];

// Patterns that identify alerts/warnings by URL
const ALERT_URL_PATTERNS = [
  /\/fi\/varoitus[_-]/,
  /\/fi\/tietomurto/,
  /\/fi\/varo-/,
];

// Weekly review / cyber weather patterns — classified as guidance (situational awareness)
const WEEKLY_REVIEW_PATTERN = /viikkokatsaus|weekly-review/i;
const CYBER_WEATHER_PATTERN = /kybersaa|cyber-weather/i;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESUME = args.includes("--resume");
const FORCE = args.includes("--force");

function getFeedFilter(): string | null {
  const feedArg = args.find((a) => a.startsWith("--feed="));
  return feedArg ? feedArg.split("=")[1]! : null;
}
const FEED_FILTER = getFeedFilter();

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

function warn(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19);
  console.warn(`[${ts}] WARN: ${msg}`);
}

function error(msg: string): void {
  const ts = new Date().toISOString().slice(0, 19);
  console.error(`[${ts}] ERROR: ${msg}`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "AnsvarNCSCFI-Crawler/1.0 (+https://ansvar.eu; cybersecurity-research)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fi,en;q=0.5",
        },
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }

      return await res.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries) {
        const backoff = RETRY_BACKOFF_MS * attempt;
        warn(`Attempt ${attempt}/${retries} failed for ${url}: ${msg} — retrying in ${backoff}ms`);
        await sleep(backoff);
      } else {
        error(`All ${retries} attempts failed for ${url}: ${msg}`);
        throw err;
      }
    }
  }
  throw new Error("Unreachable");
}

// ---------------------------------------------------------------------------
// RSS parsing
// ---------------------------------------------------------------------------

interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string;
}

function parseRssFeed(xml: string): RssItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: RssItem[] = [];

  $("item").each((_, el) => {
    const title = $(el).find("title").text().trim();
    const link = $(el).find("link").text().trim();
    const pubDate = $(el).find("pubDate").text().trim() || null;
    const description = $(el).find("description").text().trim();

    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  });

  return items;
}

// ---------------------------------------------------------------------------
// Detail page parsing
// ---------------------------------------------------------------------------

interface ParsedPage {
  title: string;
  body: string;
  date: string | null;
  summary: string | null;
  cves: string[];
  products: string[];
  severity: string | null;
}

function parseDateString(raw: string | null): string | null {
  if (!raw) return null;

  // RSS pubDate: "Fri, 20 Mar 2026 ..."
  const rssMatch = raw.match(
    /\w+,\s+(\d{1,2})\s+(\w+)\s+(\d{4})/,
  );
  if (rssMatch) {
    const months: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const mon = months[rssMatch[2]!];
    if (mon) {
      return `${rssMatch[3]}-${mon}-${rssMatch[1]!.padStart(2, "0")}`;
    }
  }

  // Finnish date: "16.4.2024" or "16.04.2024 11:56"
  const fiMatch = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (fiMatch) {
    return `${fiMatch[3]}-${fiMatch[2]!.padStart(2, "0")}-${fiMatch[1]!.padStart(2, "0")}`;
  }

  // ISO-ish: "2024-04-16"
  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return isoMatch[0]!;
  }

  return null;
}

function extractCves(text: string): string[] {
  const matches = text.match(/CVE-\d{4}-\d{4,}/g);
  return matches ? [...new Set(matches)] : [];
}

function extractSeverity(text: string): string | null {
  const lower = text.toLowerCase();

  // CVSS-based severity
  const cvssMatch = text.match(/CVSS[^:]*?[:\s]+(\d+\.?\d*)/i);
  if (cvssMatch) {
    const score = parseFloat(cvssMatch[1]!);
    if (score >= 9.0) return "critical";
    if (score >= 7.0) return "high";
    if (score >= 4.0) return "medium";
    return "low";
  }

  // Finnish severity keywords
  if (lower.includes("kriittinen") || lower.includes("critical")) return "critical";
  if (lower.includes("vakava") || lower.includes("severe") || lower.includes("high")) return "high";
  if (lower.includes("kohtalainen") || lower.includes("moderate") || lower.includes("medium")) return "medium";
  if (lower.includes("matala") || lower.includes("low")) return "low";

  return null;
}

function extractProducts(text: string): string[] {
  const products: string[] = [];

  // Match product/version patterns commonly found in NCSC-FI advisories
  const productPatterns = [
    /(?:Fortinet|FortiOS|FortiProxy|FortiManager|FortiAnalyzer|FortiWeb|FortiFone|FortiVoice|FortiNDR|FortiMail)\s*[\d.x-]*/gi,
    /(?:Cisco)\s+(?:ASA|FTD|IOS|IOS XE|ISE|Catalyst|Secure Email|EPMM|SD-WAN)[^,.\n]*/gi,
    /(?:Ivanti)\s+(?:Connect Secure|Policy Secure|EPMM|Endpoint Manager)[^,.\n]*/gi,
    /(?:Citrix|NetScaler)\s+(?:ADC|Gateway|NetScaler)[^,.\n]*/gi,
    /(?:Palo Alto)\s+(?:GlobalProtect|PAN-OS|Networks)[^,.\n]*/gi,
    /(?:SonicWall)\s+(?:Gen \d+|SMA|SSLVPN)[^,.\n]*/gi,
    /(?:Microsoft)\s+(?:Exchange|365|Windows|Office)[^,.\n]*/gi,
    /(?:PuTTY|FileZilla|WinSCP|TortoiseGit|TortoiseSVN|MOVEit|MongoDB|Redis|React|WordPress)\s*[\d.x-]*/gi,
  ];

  for (const pattern of productPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        const cleaned = m.trim().replace(/\s+/g, " ");
        if (cleaned.length > 3 && !products.includes(cleaned)) {
          products.push(cleaned);
        }
      }
    }
  }

  return [...new Set(products)].slice(0, 20);
}

function parseDetailPage(html: string, fallbackTitle: string, fallbackDate: string | null): ParsedPage {
  const $ = cheerio.load(html);

  // Remove nav, footer, cookie banners, menus
  $("nav, footer, .cookie-banner, [role='navigation'], script, style, noscript").remove();

  // Title — try h1, page-title, or fallback
  let title =
    $("h1").first().text().trim() ||
    $("[class*='PageTitle']").first().text().trim() ||
    fallbackTitle;

  // Date — look for time elements or date patterns in lead text
  let dateRaw: string | null = null;
  const timeEl = $("time").first();
  if (timeEl.length) {
    dateRaw = timeEl.attr("datetime") || timeEl.text().trim();
  }
  if (!dateRaw) {
    // Look for Finnish date pattern in lead or meta area
    const leadText = $("[class*='Lead'], [class*='lead'], .field--name-created").first().text();
    const dateMatch = leadText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dateMatch) {
      dateRaw = dateMatch[0]!;
    }
  }
  const date = parseDateString(dateRaw) ?? fallbackDate;

  // Main body text — get from main content area
  const mainContent =
    $("main").first() ||
    $("[class*='content']").first() ||
    $("article").first() ||
    $("body");

  // Extract text, preserving structure
  const bodyParts: string[] = [];
  mainContent.find("h2, h3, h4, p, li, td").each((_, el) => {
    const tag = (el as unknown as Element).tagName?.toLowerCase() ?? "";
    const text = $(el).text().trim();
    if (!text) return;

    if (tag.startsWith("h")) {
      bodyParts.push(`\n## ${text}\n`);
    } else if (tag === "li") {
      bodyParts.push(`- ${text}`);
    } else {
      bodyParts.push(text);
    }
  });

  let body = bodyParts.join("\n").trim();

  // If body extraction failed, fall back to all paragraph text
  if (body.length < 100) {
    body = $("p").map((_, el) => $(el).text().trim()).get().filter(Boolean).join("\n\n");
  }

  // If still too short, use the entire text content
  if (body.length < 50) {
    body = mainContent.text().replace(/\s+/g, " ").trim();
  }

  const fullText = `${title}\n\n${body}`;
  const cves = extractCves(fullText);
  const severity = extractSeverity(fullText);
  const products = extractProducts(fullText);

  // Summary — first meaningful paragraph (>40 chars)
  let summary: string | null = null;
  for (const part of bodyParts) {
    const cleaned = part.replace(/^[-#\s]+/, "").trim();
    if (cleaned.length > 40 && !cleaned.startsWith("##")) {
      summary = cleaned.slice(0, 500);
      break;
    }
  }

  return { title, body, date, summary, cves, products, severity };
}

// ---------------------------------------------------------------------------
// Guide listing page parsing
// ---------------------------------------------------------------------------

interface GuideLinkItem {
  title: string;
  url: string;
  section: string;
}

function parseGuideListingPage(html: string, pageUrl: string): GuideLinkItem[] {
  const $ = cheerio.load(html);
  const items: GuideLinkItem[] = [];
  let currentSection = "Yleiset ohjeet";

  // Walk through headings and links in main content
  const main = $("main").first().length ? $("main").first() : $("body");

  main.find("h2, h3, a").each((_, el) => {
    const tag = (el as unknown as Element).tagName?.toLowerCase() ?? "";

    if (tag === "h2" || tag === "h3") {
      const heading = $(el).text().trim();
      if (heading) currentSection = heading;
      return;
    }

    if (tag === "a") {
      const href = $(el).attr("href");
      const text = $(el).text().trim();

      if (!href || !text) return;
      if (text.length < 10) return;

      // Only follow internal links to guides/publications
      const isGuide =
        href.startsWith("/fi/julkaisut/") ||
        href.startsWith("/fi/ajankohtaista/ohjeet-ja-oppaat/") ||
        href.startsWith("/fi/etatyon-") ||
        href.startsWith("/fi/kvanttiturvalliset-") ||
        href.startsWith("/fi/yhteistyoryhmien-") ||
        href.startsWith("/fi/toimintamme/") ||
        href.startsWith("/fi/palvelumme/");

      if (!isGuide) return;

      // Skip the listing page itself and nav links
      if (href === new URL(pageUrl).pathname) return;

      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      items.push({ title: text, url: fullUrl, section: currentSection });
    }
  });

  return items;
}

// ---------------------------------------------------------------------------
// Reference generation
// ---------------------------------------------------------------------------

function generateReference(url: string, index: number): string {
  // Vulnerability: /fi/haavoittuvuus_13/2024 => NCSC-FI-VULN-2024-13
  const vulnMatch = url.match(/haavoittuvuus[_-](\d+)\/(\d{4})/);
  if (vulnMatch) {
    return `NCSC-FI-VULN-${vulnMatch[2]}-${vulnMatch[1]!.padStart(2, "0")}`;
  }

  // Vulnerability alternate: /fi/haavoittuvuus-2026-03
  const vulnAlt = url.match(/haavoittuvuus-(\d{4})-(\d+)/);
  if (vulnAlt) {
    return `NCSC-FI-VULN-${vulnAlt[1]}-${vulnAlt[2]!.padStart(2, "0")}`;
  }

  // Alert: /fi/varoitus_1/2025 => NCSC-FI-ALERT-2025-01
  const alertMatch = url.match(/varoitus[_-](\d+)\/(\d{4})/);
  if (alertMatch) {
    return `NCSC-FI-ALERT-${alertMatch[2]}-${alertMatch[1]!.padStart(2, "0")}`;
  }

  // Cyber weather: /fi/ajankohtaista/kybersaa_08/2025 => NCSC-FI-CYBER-WEATHER-2025-08
  const cwMatch = url.match(/kybersaa[_-](\d{2})\/(\d{4})/);
  if (cwMatch) {
    return `NCSC-FI-CYBER-WEATHER-${cwMatch[2]}-${cwMatch[1]}`;
  }

  // Weekly review: viikkokatsaus-38/2025 => NCSC-FI-WEEKLY-2025-38
  const weeklyMatch = url.match(/viikkokatsaus[_-](\d+)(?:\/|-)(\d{4})/);
  if (weeklyMatch) {
    return `NCSC-FI-WEEKLY-${weeklyMatch[2]}-${weeklyMatch[1]!.padStart(2, "0")}`;
  }

  // Weekly review alternate: viikkokatsaus-382025 => extract week + year
  const weeklyAlt = url.match(/viikkokatsaus-(\d{1,2})(\d{4})$/);
  if (weeklyAlt) {
    return `NCSC-FI-WEEKLY-${weeklyAlt[2]}-${weeklyAlt[1]!.padStart(2, "0")}`;
  }

  // Publications: /fi/julkaisut/slug => NCSC-FI-PUB-slug
  const pubMatch = url.match(/\/fi\/julkaisut\/(.+?)$/);
  if (pubMatch) {
    const slug = pubMatch[1]!.replace(/[^a-z0-9-]/gi, "-").slice(0, 60);
    return `NCSC-FI-PUB-${slug}`;
  }

  // Generic guide/news: use slug from URL
  const pathMatch = url.match(/kyberturvallisuuskeskus\.fi\/fi\/(.+?)$/);
  if (pathMatch) {
    const slug = pathMatch[1]!
      .replace(/^ajankohtaista\//, "")
      .replace(/^ohjeet-ja-oppaat\//, "")
      .replace(/[^a-z0-9-]/gi, "-")
      .slice(0, 60);
    return `NCSC-FI-${slug}`.toUpperCase().replace(/-+/g, "-");
  }

  return `NCSC-FI-ITEM-${String(index).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Content classification
// ---------------------------------------------------------------------------

type ContentType = "advisory" | "guidance";

function classifyContent(url: string, title: string): {
  type: ContentType;
  guidanceType: string | null;
  series: string | null;
} {
  // Vulnerabilities and alerts => advisory
  if (VULN_URL_PATTERNS.some((p) => p.test(url))) {
    return { type: "advisory", guidanceType: null, series: null };
  }
  if (ALERT_URL_PATTERNS.some((p) => p.test(url))) {
    return { type: "advisory", guidanceType: null, series: null };
  }

  // Weekly reviews => guidance (situational_awareness)
  if (WEEKLY_REVIEW_PATTERN.test(url) || WEEKLY_REVIEW_PATTERN.test(title)) {
    return { type: "guidance", guidanceType: "weekly_review", series: "viikkokatsaus" };
  }

  // Cyber weather => guidance (situational_awareness)
  if (CYBER_WEATHER_PATTERN.test(url) || CYBER_WEATHER_PATTERN.test(title)) {
    return { type: "guidance", guidanceType: "cyber_weather", series: "kybersaa" };
  }

  // Publications => guidance
  if (url.includes("/julkaisut/")) {
    return { type: "guidance", guidanceType: "publication", series: "NCSC-FI" };
  }

  // Guides => guidance
  if (url.includes("/ohjeet-ja-oppaat/") || url.includes("/ohjeet/")) {
    return { type: "guidance", guidanceType: "technical_guideline", series: "NCSC-FI" };
  }

  // NIS2 content
  const lower = title.toLowerCase();
  if (lower.includes("nis2") || lower.includes("kyberturvallisuuslaki")) {
    return { type: "guidance", guidanceType: "sector_guide", series: "NIS2" };
  }

  // Default: news articles go to guidance
  return { type: "guidance", guidanceType: "news_article", series: "NCSC-FI" };
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

function openDb(): Database.Database {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (FORCE && existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    log(`Deleted existing database (--force)`);
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function getExistingReferences(db: Database.Database): Set<string> {
  const refs = new Set<string>();
  const gRows = db.prepare("SELECT reference FROM guidance").all() as Array<{ reference: string }>;
  for (const r of gRows) refs.add(r.reference);
  const aRows = db.prepare("SELECT reference FROM advisories").all() as Array<{ reference: string }>;
  for (const r of aRows) refs.add(r.reference);
  return refs;
}

// ---------------------------------------------------------------------------
// Ingestion: RSS feeds
// ---------------------------------------------------------------------------

interface IngestStats {
  fetched: number;
  inserted: number;
  skipped: number;
  errors: number;
}

async function ingestRssFeed(
  db: Database.Database,
  feedName: string,
  feedUrl: string,
  existingRefs: Set<string>,
): Promise<IngestStats> {
  const stats: IngestStats = { fetched: 0, inserted: 0, skipped: 0, errors: 0 };

  log(`Fetching RSS feed: ${feedName} (${feedUrl})`);
  let xml: string;
  try {
    xml = await fetchWithRetry(feedUrl);
  } catch {
    error(`Failed to fetch feed ${feedName}`);
    stats.errors++;
    return stats;
  }

  const items = parseRssFeed(xml);
  log(`Parsed ${items.length} items from ${feedName} feed`);

  const insertAdvisory = db.prepare(`
    INSERT OR REPLACE INTO advisories
      (reference, title, date, severity, affected_products, summary, full_text, cve_references)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertGuidance = db.prepare(`
    INSERT OR REPLACE INTO guidance
      (reference, title, title_en, date, type, series, summary, full_text, topics, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const reference = generateReference(item.link, i);

    if (RESUME && existingRefs.has(reference)) {
      stats.skipped++;
      continue;
    }

    // Skip external links (traficom.fi main site, suomi.fi, vulncheck.com, etc.)
    if (!item.link.includes("kyberturvallisuuskeskus.fi")) {
      log(`  Skipping external link: ${item.link}`);
      stats.skipped++;
      continue;
    }

    stats.fetched++;
    const progress = `[${stats.fetched}/${items.length - stats.skipped}]`;

    log(`${progress} Fetching: ${item.title.slice(0, 80)}...`);

    let page: ParsedPage;
    try {
      const html = await fetchWithRetry(item.link);
      const fallbackDate = parseDateString(item.pubDate);
      page = parseDetailPage(html, item.title, fallbackDate);
    } catch {
      warn(`Failed to fetch detail page: ${item.link}`);
      // Use RSS data as fallback
      page = {
        title: item.title,
        body: item.description || item.title,
        date: parseDateString(item.pubDate),
        summary: item.description?.slice(0, 500) || null,
        cves: extractCves(item.description || ""),
        products: extractProducts(item.description || ""),
        severity: extractSeverity(item.description || ""),
      };
      stats.errors++;
    }

    const classification = classifyContent(item.link, item.title);

    if (!DRY_RUN) {
      try {
        if (classification.type === "advisory") {
          insertAdvisory.run(
            reference,
            page.title,
            page.date,
            page.severity,
            page.products.length > 0 ? JSON.stringify(page.products) : null,
            page.summary,
            page.body,
            page.cves.length > 0 ? JSON.stringify(page.cves) : null,
          );
        } else {
          // Derive topics from classification and content
          const topics = deriveTopics(page, classification);
          insertGuidance.run(
            reference,
            page.title,
            null, // title_en — would need EN page fetch
            page.date,
            classification.guidanceType,
            classification.series,
            page.summary,
            page.body,
            JSON.stringify(topics),
            "current",
          );
        }
        existingRefs.add(reference);
        stats.inserted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warn(`DB insert failed for ${reference}: ${msg}`);
        stats.errors++;
      }
    } else {
      log(`  [dry-run] Would insert ${classification.type}: ${reference}`);
      stats.inserted++;
    }

    // Rate limiting
    if (i < items.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Ingestion: Guide listing pages
// ---------------------------------------------------------------------------

async function ingestGuideListings(
  db: Database.Database,
  existingRefs: Set<string>,
): Promise<IngestStats> {
  const stats: IngestStats = { fetched: 0, inserted: 0, skipped: 0, errors: 0 };
  const seenUrls = new Set<string>();

  const insertGuidance = db.prepare(`
    INSERT OR REPLACE INTO guidance
      (reference, title, title_en, date, type, series, summary, full_text, topics, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const listingUrl of GUIDE_LISTING_PAGES) {
    log(`Fetching guide listing: ${listingUrl}`);

    let html: string;
    try {
      html = await fetchWithRetry(listingUrl);
    } catch {
      error(`Failed to fetch listing: ${listingUrl}`);
      stats.errors++;
      continue;
    }

    const guideLinks = parseGuideListingPage(html, listingUrl);
    log(`Found ${guideLinks.length} guide links on listing page`);

    for (const link of guideLinks) {
      if (seenUrls.has(link.url)) continue;
      seenUrls.add(link.url);

      const reference = generateReference(link.url, stats.fetched);

      if (RESUME && existingRefs.has(reference)) {
        stats.skipped++;
        continue;
      }

      // Skip PDF links — we only crawl HTML pages
      if (link.url.endsWith(".pdf")) {
        stats.skipped++;
        continue;
      }

      stats.fetched++;
      log(`  [${stats.fetched}] Fetching guide: ${link.title.slice(0, 70)}...`);

      let page: ParsedPage;
      try {
        const detailHtml = await fetchWithRetry(link.url);
        page = parseDetailPage(detailHtml, link.title, null);
      } catch {
        warn(`Failed to fetch guide: ${link.url}`);
        page = {
          title: link.title,
          body: link.title,
          date: null,
          summary: null,
          cves: [],
          products: [],
          severity: null,
        };
        stats.errors++;
      }

      if (!DRY_RUN) {
        try {
          const topics = [link.section];
          if (link.url.includes("sote") || link.url.includes("sosiaali")) {
            topics.push("terveydenhuolto", "healthcare");
          }
          if (link.url.includes("m365") || link.url.includes("microsoft")) {
            topics.push("Microsoft 365");
          }
          if (link.url.includes("nis2") || link.url.includes("kyberturvallisuuslaki")) {
            topics.push("NIS2");
          }

          insertGuidance.run(
            reference,
            page.title,
            null,
            page.date,
            "technical_guideline",
            "NCSC-FI",
            page.summary,
            page.body,
            JSON.stringify(topics),
            "current",
          );
          existingRefs.add(reference);
          stats.inserted++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warn(`DB insert failed for ${reference}: ${msg}`);
          stats.errors++;
        }
      } else {
        log(`  [dry-run] Would insert guide: ${reference}`);
        stats.inserted++;
      }

      await sleep(RATE_LIMIT_MS);
    }

    await sleep(RATE_LIMIT_MS);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Topic derivation
// ---------------------------------------------------------------------------

function deriveTopics(
  page: ParsedPage,
  classification: { guidanceType: string | null; series: string | null },
): string[] {
  const topics: string[] = [];
  const text = `${page.title} ${page.body}`.toLowerCase();

  // Content-based topic detection
  const topicMap: Array<[RegExp, string]> = [
    [/nis2|kyberturvallisuuslaki/i, "NIS2"],
    [/ransomware|kiristys(?:haittaohjelma|hyokkays)/i, "kiristyshaittaohjelma"],
    [/phishing|kalastelu|tietojenkalastelu/i, "tietojenkalastelu"],
    [/microsoft 365|m365|office 365/i, "Microsoft 365"],
    [/haavoittuvuus|vulnerability|cve-/i, "haavoittuvuudet"],
    [/toimitusketju|supply chain/i, "toimitusketju"],
    [/kryptografi|salaus|tls|encryption/i, "kryptografia"],
    [/isms|iso 27001|hallintajarjestelma/i, "ISMS"],
    [/palvelunesto|ddos|denial.of.service/i, "palvelunestohyokkays"],
    [/tekoaly|ai|artificial.intelligence/i, "tekoaly"],
    [/pilvip|cloud/i, "pilvipalvelut"],
    [/sote|terveydenhuol|healthcare/i, "terveydenhuolto"],
    [/etaty[oö]|remote.work/i, "etatyo"],
    [/haittaohjelma|malware/i, "haittaohjelma"],
    [/huijau|scam|fraud/i, "huijaukset"],
    [/riskienhallinta|risk.management/i, "riskienhallinta"],
    [/wordpress/i, "WordPress"],
    [/reititin|router/i, "verkkolaitteet"],
    [/pqc|kvantti|quantum/i, "kvanttilaskenta"],
    [/sbom|ohjelmistoturvallisuus|software.security/i, "ohjelmistoturvallisuus"],
    [/tietomurto|data.breach/i, "tietomurto"],
    [/audit|loki|log/i, "lokienhallinta"],
  ];

  for (const [pattern, topic] of topicMap) {
    if (pattern.test(text)) {
      topics.push(topic);
    }
  }

  // Add series/type as topic
  if (classification.series && classification.series !== "NCSC-FI") {
    topics.push(classification.series);
  }

  return topics.length > 0 ? topics : ["kyberturvallisuus"];
}

// ---------------------------------------------------------------------------
// Framework updates
// ---------------------------------------------------------------------------

function updateFrameworks(db: Database.Database): void {
  if (DRY_RUN) {
    log("[dry-run] Would update framework document counts");
    return;
  }

  // Upsert frameworks based on content categories
  const upsertFramework = db.prepare(`
    INSERT INTO frameworks (id, name, name_en, description, document_count)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET document_count = excluded.document_count
  `);

  // Count guidance by series
  const seriesCounts = db
    .prepare("SELECT series, COUNT(*) as cnt FROM guidance WHERE series IS NOT NULL GROUP BY series")
    .all() as Array<{ series: string; cnt: number }>;

  const frameworkDefs: Array<{
    id: string;
    name: string;
    name_en: string;
    description: string;
    seriesMatch: string;
  }> = [
    {
      id: "ncsc-fi-guidelines",
      name: "NCSC-FI Kyberturvallisuusohjeet",
      name_en: "NCSC-FI Cybersecurity Guidelines",
      description:
        "Kyberturvallisuuskeskuksen julkaisemat ohjeet ja suositukset organisaatioille tietoturvallisuuden parantamiseksi. Kattaa tekniset ohjeet, toimialakohtaiset suositukset ja julkaisut.",
      seriesMatch: "NCSC-FI",
    },
    {
      id: "nis2-implementation",
      name: "NIS2-direktiivin kansallinen toimeenpano",
      name_en: "NIS2 Directive National Implementation",
      description:
        "Ohjeet NIS2-direktiivin (EU 2022/2555) kansallisesta toimeenpanosta Suomessa. Sisaltaa vaatimusten tulkinnan, ilmoitusvelvollisuudet ja kyberturvallisuuslain (124/2025) soveltamisohjeet.",
      seriesMatch: "NIS2",
    },
    {
      id: "viikkokatsaus",
      name: "Viikkokatsaukset",
      name_en: "Weekly Reviews",
      description:
        "Kyberturvallisuuskeskuksen viikoittaiset tilannekatsaukset ajankohtaisista kyberturvallisuusilmioista, uhkista ja haavoittuvuuksista.",
      seriesMatch: "viikkokatsaus",
    },
    {
      id: "kybersaa",
      name: "Kybersaa-raportit",
      name_en: "Cyber Weather Reports",
      description:
        "Kuukausittaiset kyberturvallisuuden tilannekuvat: tietomurrot, huijaukset, haittaohjelmat, haavoittuvuudet ja ilmiotrendit.",
      seriesMatch: "kybersaa",
    },
  ];

  for (const fw of frameworkDefs) {
    const count = seriesCounts.find((s) => s.series === fw.seriesMatch)?.cnt ?? 0;
    upsertFramework.run(fw.id, fw.name, fw.name_en, fw.description, count);
  }

  // Advisory count for a pseudo-framework
  const advisoryCount = (
    db.prepare("SELECT COUNT(*) as cnt FROM advisories").get() as { cnt: number }
  ).cnt;
  upsertFramework.run(
    "ncsc-fi-advisories",
    "NCSC-FI Haavoittuvuus- ja varoitustiedotteet",
    "NCSC-FI Vulnerability Advisories and Alerts",
    "Kyberturvallisuuskeskuksen julkaisemat haavoittuvuustiedotteet, varoitukset ja poikkeamailmoitukset.",
    advisoryCount,
  );

  log(`Updated ${frameworkDefs.length + 1} framework document counts`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("=== NCSC-FI Ingestion Crawler ===");
  log(`Database: ${DB_PATH}`);
  log(`Mode: ${DRY_RUN ? "DRY RUN" : FORCE ? "FORCE (re-ingest)" : RESUME ? "RESUME" : "FULL"}`);
  if (FEED_FILTER) log(`Feed filter: ${FEED_FILTER}`);
  log("");

  const db = openDb();
  const existingRefs = RESUME ? getExistingReferences(db) : new Set<string>();
  if (RESUME) {
    log(`Found ${existingRefs.size} existing references (will skip)`);
  }

  const allStats: Record<string, IngestStats> = {};

  // 1. Vulnerability feed
  if (!FEED_FILTER || FEED_FILTER === "vulns") {
    allStats["vulns"] = await ingestRssFeed(db, "vulnerabilities", RSS_FEEDS.vulns, existingRefs);
    log("");
  }

  // 2. Alerts feed
  if (!FEED_FILTER || FEED_FILTER === "alerts") {
    allStats["alerts"] = await ingestRssFeed(db, "alerts", RSS_FEEDS.alerts, existingRefs);
    log("");
  }

  // 3. News feed (includes weekly reviews, cyber weather, general articles)
  if (!FEED_FILTER || FEED_FILTER === "news") {
    allStats["news"] = await ingestRssFeed(db, "news", RSS_FEEDS.news, existingRefs);
    log("");
  }

  // 4. Guide listing pages
  if (!FEED_FILTER || FEED_FILTER === "guides") {
    allStats["guides"] = await ingestGuideListings(db, existingRefs);
    log("");
  }

  // 5. Update framework document counts
  updateFrameworks(db);

  // Summary
  log("=== Ingestion Summary ===");
  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [name, stats] of Object.entries(allStats)) {
    log(`  ${name.padEnd(10)} — fetched: ${stats.fetched}, inserted: ${stats.inserted}, skipped: ${stats.skipped}, errors: ${stats.errors}`);
    totalFetched += stats.fetched;
    totalInserted += stats.inserted;
    totalSkipped += stats.skipped;
    totalErrors += stats.errors;
  }

  log("");
  log(`  TOTAL      — fetched: ${totalFetched}, inserted: ${totalInserted}, skipped: ${totalSkipped}, errors: ${totalErrors}`);

  // DB stats
  if (!DRY_RUN) {
    const guidanceCount = (db.prepare("SELECT COUNT(*) as cnt FROM guidance").get() as { cnt: number }).cnt;
    const advisoryCount = (db.prepare("SELECT COUNT(*) as cnt FROM advisories").get() as { cnt: number }).cnt;
    const frameworkCount = (db.prepare("SELECT COUNT(*) as cnt FROM frameworks").get() as { cnt: number }).cnt;
    log("");
    log(`Database totals:`);
    log(`  Frameworks:  ${frameworkCount}`);
    log(`  Guidance:    ${guidanceCount}`);
    log(`  Advisories:  ${advisoryCount}`);
  }

  db.close();
  log("");
  log("Done.");
}

main().catch((err) => {
  error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
