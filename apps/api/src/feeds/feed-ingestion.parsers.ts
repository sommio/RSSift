import type { parseFeed } from "feedsmith";

export function getFeedItems(parsedFeed: ReturnType<typeof parseFeed>) {
  if (parsedFeed.format === "rss" || parsedFeed.format === "json") {
    return (parsedFeed.feed.items ?? []) as Array<Record<string, unknown>>;
  }

  if (parsedFeed.format === "atom") {
    return (parsedFeed.feed.entries ?? []) as Array<Record<string, unknown>>;
  }

  return (parsedFeed.feed.items ?? []) as Array<Record<string, unknown>>;
}

export function getFeedTitle(parsedFeed: ReturnType<typeof parseFeed>) {
  return getString(parsedFeed.feed.title);
}

export function getFeedSiteUrl(parsedFeed: ReturnType<typeof parseFeed>) {
  if (parsedFeed.format === "rss" || parsedFeed.format === "rdf") {
    return getString(parsedFeed.feed.link);
  }

  if (parsedFeed.format === "json") {
    return getString(parsedFeed.feed.home_page_url);
  }

  const alternateLink = parsedFeed.feed.links?.find(
    (entry) => entry.rel === "alternate" || !entry.rel,
  );

  return getString(alternateLink?.href);
}

export function getSourceId(item: Record<string, unknown>) {
  const guid = item["guid"];

  if (typeof guid === "object" && guid !== null) {
    return getString((guid as Record<string, unknown>)["value"]);
  }

  return (
    getString(item["id"]) ??
    getString(item["guid"]) ??
    getString(item["itemGuid"])
  );
}

export function getItemUrl(item: Record<string, unknown>) {
  if (Array.isArray(item["links"])) {
    const alternateLink = (
      item["links"] as Array<Record<string, unknown>>
    ).find((entry) => getString(entry["rel"]) === "alternate" || !entry["rel"]);

    const href = getString(alternateLink?.["href"]);

    if (href) {
      return href;
    }
  }

  return (
    getString(item["url"]) ??
    getString(item["external_url"]) ??
    getString(item["link"])
  );
}

export function getItemPublishedAt(item: Record<string, unknown>) {
  return (
    getString(item["published"]) ??
    getString(item["updated"]) ??
    getString(item["date_published"]) ??
    getString(item["pubDate"])
  );
}

export function getItemSummary(item: Record<string, unknown>) {
  return (
    getString(item["summary"]) ??
    getString(item["description"]) ??
    getString(item["content_text"]) ??
    getString(item["content_html"]) ??
    ""
  );
}

export function toDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
