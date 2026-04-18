ALTER TABLE "Article"
ADD COLUMN "translatedTitle" TEXT NOT NULL DEFAULT '';

UPDATE "Article"
SET
  "summary" = '',
  "translatedTitle" = '';
