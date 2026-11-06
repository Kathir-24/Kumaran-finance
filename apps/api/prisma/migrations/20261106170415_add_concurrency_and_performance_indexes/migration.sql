-- CreateIndex
CREATE INDEX "InstallmentDue_status_dueDate_idx" ON "InstallmentDue"("status", "dueDate");

-- CreateIndex
CREATE INDEX "SubscriberTicket_customerId_idx" ON "SubscriberTicket"("customerId");
