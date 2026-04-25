import { ApiProperty } from "@nestjs/swagger";

export class ArticleSummaryErrorDto {
  @ApiProperty({ type: String })
  action!: string;

  @ApiProperty({ type: String })
  code!: string;

  @ApiProperty({ type: String })
  copyText!: string;

  @ApiProperty({ type: String })
  message!: string;

  @ApiProperty({ type: String })
  title!: string;
}

export class ArticleDetailItemDto {
  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  translatedTitle!: string;

  @ApiProperty({ type: String })
  sourceTitle!: string;

  @ApiProperty({ type: String, format: "date-time" })
  publishedAt!: string;

  @ApiProperty({ type: String })
  summary!: string;

  @ApiProperty({ type: () => ArticleSummaryErrorDto, nullable: true })
  summaryError!: ArticleSummaryErrorDto | null;

  @ApiProperty({ type: String })
  originalUrl!: string;
}
