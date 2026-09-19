-- CreateEnum
CREATE TYPE "ResearchEventClassificationMethod" AS ENUM ('STRUCTURED_SOURCE', 'RULE', 'MANUAL', 'FUTURE_LLM');

-- AlterTable
ALTER TABLE "research_events" ADD COLUMN     "classification_evidence" TEXT,
ADD COLUMN     "classification_method" "ResearchEventClassificationMethod",
ADD COLUMN     "classification_rule_id" TEXT;
