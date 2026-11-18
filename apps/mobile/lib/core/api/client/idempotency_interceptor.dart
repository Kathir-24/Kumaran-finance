// ==============================================================================
// Kumaran Chits — Dart Idempotency Interceptor
// Automatically generates and injects UUID v4 Idempotency-Key headers on mutations.
// ==============================================================================

import 'dart:math';

class IdempotencyHelper {
  static final Random _random = Random.secure();

  /// Generates a RFC 4122 version 4 UUID
  static String generateUuidV4() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx

    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}';
  }

  /// Checks if a request path involves financial state mutations that require Idempotency-Key
  static bool requiresIdempotency(String method, String path) {
    final m = method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].contains(m)) {
      return false;
    }
    return path.contains('/payments') ||
        path.contains('/collections') ||
        path.contains('/disbursements') ||
        path.contains('/reversals') ||
        path.contains('/auctions');
  }
}
