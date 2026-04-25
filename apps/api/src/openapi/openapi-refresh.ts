import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

import { Test } from "@nestjs/testing";
import { AppModule } from "../app.module";
import { FeedBootstrapService } from "../feeds/feed-bootstrap.service";
import { createOpenApiDocument } from "./openapi-document";

const contractFilePath = resolve(
  __dirname,
  "../../../../packages/api-contract/openapi/openapi.yaml",
);

export async function refreshOpenApiContract() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(FeedBootstrapService)
    .useValue({
      onApplicationBootstrap: () => undefined,
    })
    .compile();

  const app = moduleRef.createNestApplication();

  try {
    await app.init();

    const document = createOpenApiDocument(app);
    const yaml = YAML.stringify(document, {
      sortMapEntries: true,
    });

    await mkdir(dirname(contractFilePath), { recursive: true });
    await writeFile(contractFilePath, `${yaml.trimEnd()}\n`, "utf8");
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void refreshOpenApiContract();
}
