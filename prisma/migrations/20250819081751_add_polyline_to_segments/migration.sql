-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "stravaId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."strava_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."starred_segments" (
    "id" TEXT NOT NULL,
    "stravaSegmentId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "averageGrade" DOUBLE PRECISION NOT NULL,
    "maximumGrade" DOUBLE PRECISION NOT NULL,
    "elevationHigh" DOUBLE PRECISION NOT NULL,
    "elevationLow" DOUBLE PRECISION NOT NULL,
    "startLatitude" DOUBLE PRECISION NOT NULL,
    "startLongitude" DOUBLE PRECISION NOT NULL,
    "endLatitude" DOUBLE PRECISION NOT NULL,
    "endLongitude" DOUBLE PRECISION NOT NULL,
    "komTime" INTEGER,
    "komAthleteId" INTEGER,
    "polyline" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "starred_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."optimized_routes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalDistance" DOUBLE PRECISION NOT NULL,
    "totalElevation" DOUBLE PRECISION NOT NULL,
    "estimatedTime" INTEGER NOT NULL,
    "startLatitude" DOUBLE PRECISION NOT NULL,
    "startLongitude" DOUBLE PRECISION NOT NULL,
    "gpxData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "optimized_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."route_segments" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "route_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_stravaId_key" ON "public"."users"("stravaId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "starred_segments_stravaSegmentId_key" ON "public"."starred_segments"("stravaSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "route_segments_routeId_segmentId_key" ON "public"."route_segments"("routeId", "segmentId");

-- AddForeignKey
ALTER TABLE "public"."strava_tokens" ADD CONSTRAINT "strava_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."optimized_routes" ADD CONSTRAINT "optimized_routes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."route_segments" ADD CONSTRAINT "route_segments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."optimized_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."route_segments" ADD CONSTRAINT "route_segments_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."starred_segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
