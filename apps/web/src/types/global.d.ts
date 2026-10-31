// ==============================================================================
// Strongly-Typed Next-Intl Message Catalog Schema
// Automatically infers all keys from messages/en.json for compile-time safety.
// ==============================================================================

import en from '../../messages/en.json';

type Messages = typeof en;

declare global {
  // Use type safe message keys with `next-intl`
  interface IntlMessages extends Messages {}
}
