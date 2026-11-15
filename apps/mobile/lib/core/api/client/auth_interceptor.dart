// ==============================================================================
// Kumaran Chits — Dart Auth & Token Refresh Interceptor
// Manages Bearer token injection, single-flight mutex locking, and 401 refresh token rotation.
// ==============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:io';

typedef TokenGetter = Future<String?> Function();
typedef TokenRefreshedCallback = Future<void> Function(String accessToken, String? refreshToken);
typedef UnauthorizedCallback = Future<void> Function();

class AuthSessionManager {
  final TokenGetter getAccessToken;
  final TokenGetter? getRefreshToken;
  final TokenRefreshedCallback? onTokenRefreshed;
  final UnauthorizedCallback? onUnauthorized;
  final String clientType;

  // Single-flight refresh mutex: ensures multiple concurrent 401s coalesce into 1 refresh call
  Future<bool>? _inFlightRefresh;

  AuthSessionManager({
    required this.getAccessToken,
    this.getRefreshToken,
    this.onTokenRefreshed,
    this.onUnauthorized,
    this.clientType = 'MOBILE',
  });

  /// Formats the Authorization Bearer header
  Future<Map<String, String>> getAuthHeaders() async {
    final token = await getAccessToken();
    if (token != null && token.isNotEmpty) {
      return {'Authorization': 'Bearer $token'};
    }
    return {};
  }

  /// Executes single-flight token rotation against /auth/refresh with clientType family binding
  Future<bool> refreshToken(String baseUrl, HttpClient httpClient) async {
    if (getRefreshToken == null || onTokenRefreshed == null) {
      if (onUnauthorized != null) {
        await onUnauthorized!();
      }
      return false;
    }

    // Coalesce multiple concurrent 401s into a single in-flight refresh operation
    if (_inFlightRefresh != null) {
      return await _inFlightRefresh!;
    }

    final completer = Completer<bool>();
    _inFlightRefresh = completer.future;

    try {
      final currentRefresh = await getRefreshToken!();
      if (currentRefresh == null || currentRefresh.isEmpty) {
        if (onUnauthorized != null) await onUnauthorized!();
        completer.complete(false);
        return false;
      }

      final cleanBase = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
      final uri = Uri.parse('$cleanBase/auth/refresh');
      final request = await httpClient.openUrl('POST', uri);
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');

      final body = jsonEncode({
        'refreshToken': currentRefresh,
        'clientType': clientType,
      });
      request.write(body);

      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();

      if (response.statusCode == 200 || response.statusCode == 201) {
        final parsed = jsonDecode(responseBody);
        final data = parsed is Map<String, dynamic> && parsed.containsKey('data')
            ? parsed['data'] as Map<String, dynamic>
            : (parsed as Map<String, dynamic>);

        final newAccess = data['accessToken'] as String?;
        final newRefresh = data['refreshToken'] as String?;

        if (newAccess != null && newAccess.isNotEmpty) {
          await onTokenRefreshed!(newAccess, newRefresh);
          completer.complete(true);
          return true;
        }
      }

      // Refresh failed (invalid/expired refresh token or revoked session)
      if (onUnauthorized != null) {
        await onUnauthorized!();
      }
      completer.complete(false);
      return false;
    } catch (_) {
      if (onUnauthorized != null) {
        await onUnauthorized!();
      }
      completer.complete(false);
      return false;
    } finally {
      _inFlightRefresh = null;
    }
  }
}
