CREATE TYPE "IdentitySourceType" AS ENUM (
  'SOURCE_ID',
  'CANONICAL_URL',
  'CONTENT_SIGNATURE'
);

CREATE TABLE "Feed" (
  "id" TEXT NOT NULL,
  "feedUrl" TEXT NOT NULL,
  "siteTitle" TEXT,
  "siteUrl" TEXT,
  "etag" TEXT,
  "lastModified" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Feed_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Article" (
  "id" TEXT NOT NULL,
  "feedId" TEXT NOT NULL,
  "identityHash" TEXT NOT NULL,
  "identitySourceType" "IdentitySourceType" NOT NULL,
  "identitySourceValue" TEXT NOT NULL,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "ingestedAt" TIMESTAMP(3) NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Feed_feedUrl_key" ON "Feed"("feedUrl");
CREATE UNIQUE INDEX "Article_feedId_identityHash_key" ON "Article"("feedId", "identityHash");
CREATE INDEX "Article_feedId_idx" ON "Article"("feedId");
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

ALTER TABLE "Article"
ADD CONSTRAINT "Article_feedId_fkey"
FOREIGN KEY ("feedId") REFERENCES "Feed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
