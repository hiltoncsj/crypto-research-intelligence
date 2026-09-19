/*
  Warnings:

  - You are about to alter the column `growth_momentum` on the `research_run_selections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(6,4)` to `Decimal(5,2)`.
  - You are about to alter the column `capital_momentum` on the `research_run_selections` table. The data in that column could be lost. The data in that column will be cast from `Decimal(6,4)` to `Decimal(5,2)`.

*/
-- AlterTable
ALTER TABLE "research_run_selections" ALTER COLUMN "growth_momentum" SET DATA TYPE DECIMAL(5,2),
ALTER COLUMN "capital_momentum" SET DATA TYPE DECIMAL(5,2);
