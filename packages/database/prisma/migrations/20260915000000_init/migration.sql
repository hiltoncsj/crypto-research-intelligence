-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DISCOVERED', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_sector_id" TEXT,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defillama_chain_slug" TEXT NOT NULL,

    CONSTRAINT "chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defillama_id" TEXT NOT NULL,
    "sector_id" TEXT NOT NULL,
    "narrative_id" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DISCOVERED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sectors_name_key" ON "sectors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "chains_defillama_chain_slug_key" ON "chains"("defillama_chain_slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "projects_defillama_id_key" ON "projects"("defillama_id");

-- CreateIndex
CREATE INDEX "projects_sector_id_idx" ON "projects"("sector_id");

-- AddForeignKey
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_parent_sector_id_fkey" FOREIGN KEY ("parent_sector_id") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "sectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
