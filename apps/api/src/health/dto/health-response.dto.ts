import { ApiProperty } from "@nestjs/swagger";

export class HealthLiveChecksDto {
  @ApiProperty({ type: String })
  application!: string;
}

export class HealthReadyChecksDto {
  @ApiProperty({ type: String })
  application!: string;

  @ApiProperty({ type: String })
  database!: string;
}

export class HealthLiveResponseDto {
  @ApiProperty({ type: () => HealthLiveChecksDto })
  checks!: HealthLiveChecksDto;

  @ApiProperty({ type: String })
  service!: string;

  @ApiProperty({ type: String })
  status!: string;
}

export class HealthReadyResponseDto {
  @ApiProperty({ type: () => HealthReadyChecksDto })
  checks!: HealthReadyChecksDto;

  @ApiProperty({ type: String })
  service!: string;

  @ApiProperty({ type: String })
  status!: string;
}
