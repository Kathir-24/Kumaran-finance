-- CreateIndex
CREATE INDEX "AuctionTieBidder_ticketId_idx" ON "AuctionTieBidder"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionTieBidder_auctionId_ticketId_key" ON "AuctionTieBidder"("auctionId", "ticketId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_ticketId_idx" ON "PaymentAllocation"("ticketId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_installmentDueId_idx" ON "PaymentAllocation"("installmentDueId");
