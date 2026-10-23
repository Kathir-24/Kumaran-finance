-- AlterTable
ALTER TABLE "InstallmentDue" ADD COLUMN     "cycleEndDate" TIMESTAMP(3),
ADD COLUMN     "cycleStartDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "InstallmentDue_chitGroupId_installmentMonth_idx" ON "InstallmentDue"("chitGroupId", "installmentMonth");
