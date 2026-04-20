CREATE TABLE "FeedAutoRefreshState" (
  "id" TEXT NOT NULL,
  "lastSuccessfulAutoRefreshAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeedAutoRefreshState_pkey" PRIMARY KEY ("id")
);
