import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ArticlesModule } from "./articles/articles.module";
import { getEnvFilePaths } from "./config/app-config";
import { validateEnv } from "./config/env.validation";
import { FeedsModule } from "./feeds/feeds.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: getEnvFilePaths(__dirname),
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ArticlesModule,
    FeedsModule,
  ],
})
export class AppModule {}
