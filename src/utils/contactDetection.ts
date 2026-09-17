// Off-platform contact detection -- warns a sender before a chat message
// carrying a phone number, email address, or UPI id actually goes out.
// This is a WARNING, not a hard block or silent redaction: the sender can
// still choose to send it (see ConversationDetailScreen.onSend), and every
// message that goes through anyway is auto-filed into the existing
// `reports` table (target_kind: 'conversation') for admin visibility --
// the same table ReportScreen already writes to, no new schema needed.
// This is a real, first pass at deterring off-platform-contact commission
// bypass, not a claim of catching every possible obfuscation (e.g. "nine
// eight seven..." spelled out in words is not detected).

// 10-digit Indian mobile number, optionally with +91/0 prefix and common
// separators (spaces, dashes, dots) a person might type between digits.
const PHONE_PATTERN = /(?:\+?91[\s-]?)?[6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// UPI ids look like `handle@psp` (e.g. rahul@okaxis, 9876543210@ybl) --
// deliberately distinct from EMAIL_PATTERN by requiring no dot after the @
// and matching common PSP handles, so a real email isn't double-flagged.
const UPI_PATTERN = /\b[\w.-]{2,}@(?:ok(?:axis|hdfcbank|icici|sbi)|ybl|paytm|apl|ibl|axl|upi)\b/i;

export type OffPlatformContactType = 'phone' | 'email' | 'upi';

export const detectOffPlatformContact = (text: string): OffPlatformContactType | null => {
  if (PHONE_PATTERN.test(text)) return 'phone';
  if (UPI_PATTERN.test(text)) return 'upi';
  if (EMAIL_PATTERN.test(text)) return 'email';
  return null;
};

export const OFF_PLATFORM_WARNING_TITLE = 'Keep it on VELORA';
export const OFF_PLATFORM_WARNING_BODY =
  "This message looks like it contains a phone number, email, or UPI id. For your safety and to keep booking protection active, arrange everything through VELORA chat and booking. Send anyway?";
