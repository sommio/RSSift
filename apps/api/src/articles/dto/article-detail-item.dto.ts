export class ArticleSummaryErrorDto {
  action!: string;
  code!: string;
  copyText!: string;
  message!: string;
  title!: string;
}

export class ArticleDetailItemDto {
  title!: string;
  translatedTitle!: string;
  sourceTitle!: string;
  publishedAt!: string;
  summary!: string;
  summaryError!: ArticleSummaryErrorDto | null;
  originalUrl!: string;
}
