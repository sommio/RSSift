import { NestFactory } from "@nestjs/core";
import { networkInterfaces } from "node:os";

import { AppModule } from "./app.module";
import { getAppConfig } from "./config/app-config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.enableShutdownHooks();
  const { port } = getAppConfig();
  await app.listen(port, "0.0.0.0");

  console.log(
    `Local: ${(await app.getUrl()).replace("[::1]", "localhost").replace("[::]", "localhost")}`,
  );
  console.log(
    `Network: http://${
      Object.values(networkInterfaces())
        .flat()
        .find((entry) => entry?.family === "IPv4" && !entry.internal)
        ?.address ?? "localhost"
    }:${String(port)}`,
  );
}

void bootstrap();
