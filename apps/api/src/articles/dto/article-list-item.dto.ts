import { ApiProperty } from "@nestjs/swagger";

export class ArticleListItemDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  title!: string;

  @ApiProperty({ type: String })
  translatedTitle!: string;

  @ApiProperty({ type: String })
  sourceTitle!: string;

  @ApiProperty({ type: String, format: "date-time" })
  publishedAt!: string;

  @ApiProperty({ type: String })
  originalUrl!: string;
}
