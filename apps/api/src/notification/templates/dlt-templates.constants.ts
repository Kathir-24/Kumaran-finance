// ==============================================================================
// Kumaran Chits — TRAI DLT Template Definitions & Default Header
// Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
// Compliance: docs/02-requirements/notification-and-receipt-templates.md (§2)
// ==============================================================================

export const DLT_CONFIG = {
  DEFAULT_SENDER_ID: 'KMRCHT',
  TEMPLATES: {
    // 1. Device Registration / Staff Login OTP
    DEVICE_OTP: {
      templateId: '1407169823412093847',
      text: 'Kumaran Chits: Your one-time verification code is {#var#}. Valid for 5 minutes. Do not share this OTP with anyone. / உங்கள் சரிபார்ப்பு குறியீடு {#var#}. யாருடனும் பகிர வேண்டாம்.',
    },
    // 2. Subscription Payment Receipt Alert
    PAYMENT_RECEIPT: {
      templateId: '1407169823412093848',
      text: 'Kumaran Chits: Received Rs.{#var#} for Chit {#var#}, Ticket #{#var#} on {#var#}. Receipt: {#var#}. View passbook: {#var#}',
    },
    // 3. Upcoming Monthly Auction Reminder
    AUCTION_REMINDER: {
      templateId: '1407169823412093849',
      text: 'Kumaran Chits: Auction for Chit {#var#} Month {#var#} is scheduled on {#var#} at {#var#}. Venue: {#var#}. Contact: {#var#}',
    },
    // 4. Default Arrears Warning Notice (3-Month Continuous Arrears)
    DEFAULT_WARNING: {
      templateId: '1407169823412093850',
      text: 'Kumaran Chits: Urgent: Ticket #{#var#} in Chit {#var#} has {#var#} months overdue (Rs.{#var#}). Clear dues to avoid membership cancellation. Contact: {#var#}',
    },
  },
} as const;
