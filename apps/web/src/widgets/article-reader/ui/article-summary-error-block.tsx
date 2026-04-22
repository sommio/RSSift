import type { ArticleDetail } from "../api/articles-api";

export function ArticleSummaryErrorBlock({
  summaryError,
}: {
  summaryError: NonNullable<ArticleDetail["summaryError"]>;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/80 bg-muted/35 p-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-foreground/55 uppercase">
          Summary unavailable
        </p>
        <h2 className="text-xl font-semibold text-foreground">
          {summaryError.title}
        </h2>
        <p className="leading-7 text-foreground/80">{summaryError.message}</p>
        <p className="leading-7 text-foreground/80">{summaryError.action}</p>
      </div>
      <div className="rounded-xl border border-border/70 bg-background/80 p-4">
        <p className="text-xs font-semibold tracking-widest text-foreground/55 uppercase">
          Support note
        </p>
        <p className="mt-3 font-mono text-sm leading-6 text-foreground/80">
          {summaryError.copyText}
        </p>
        <p className="mt-3 text-xs font-medium tracking-wider text-foreground/50 uppercase">
          Error code: {summaryError.code}
        </p>
      </div>
    </div>
  );
}
