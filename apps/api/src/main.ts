import { NestFactory } from "@nestjs/core";
import { networkInterfaces } from "node:os";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env["PORT"] ?? 3000);
  await app.listen(port);

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
