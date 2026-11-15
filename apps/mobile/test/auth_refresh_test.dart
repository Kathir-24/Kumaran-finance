// ==============================================================================
// Kumaran Chits — Dart Auth Refresh Interceptor Test Suite (F14)
// Validates single-flight token rotation, 401 request replay, and error handling.
// ==============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import '../lib/core/api/client/api_client.dart';
import '../lib/core/api/client/api_error.dart';
import '../lib/core/api/client/auth_interceptor.dart';

void assertEqual(dynamic actual, dynamic expected, String message) {
  if (actual != expected) {
    throw Exception('Assertion failed: $message (Expected: $expected, Actual: $actual)');
  }
}

Future<void> main() async {
  print('Running Mobile Auth & Token Refresh Tests (F14)...');

  // Start local loopback HTTP server to simulate NestJS backend
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final serverPort = server.port;
  final baseUrl = 'http://127.0.0.1:$serverPort';

  int refreshRequestCount = 0;
  int protectedEndpointCount = 0;
  String currentAccessToken = 'expired_token_123';
  String currentRefreshToken = 'valid_refresh_token_999';
  bool unauthorizedCallbackCalled = false;

  // Background server handler
  final serverSub = server.listen((HttpRequest request) async {
    final path = request.uri.path;

    if ((path == '/api/v1/auth/refresh-token' || path == '/auth/refresh-token') && request.method == 'POST') {
      refreshRequestCount++;
      final bodyStr = await utf8.decodeStream(request);
      final body = jsonDecode(bodyStr);

      if (body['refreshToken'] == 'valid_refresh_token_999') {
        // Assert clientType: 'MOBILE' is sent
        assertEqual(body['clientType'], 'MOBILE', 'Refresh request must send clientType: MOBILE');

        currentAccessToken = 'refreshed_access_token_456';
        currentRefreshToken = 'new_refresh_token_000';

        request.response.statusCode = 200;
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode({
          'success': true,
          'data': {
            'accessToken': currentAccessToken,
            'refreshToken': currentRefreshToken,
          },
        }));
        await request.response.close();
        return;
      } else {
        request.response.statusCode = 401;
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode({
          'statusCode': 401,
          'message': 'Invalid refresh token',
        }));
        await request.response.close();
        return;
      }
    }

    if (path == '/api/v1/protected' && request.method == 'GET') {
      protectedEndpointCount++;
      final authHeader = request.headers.value(HttpHeaders.authorizationHeader);

      if (authHeader == 'Bearer refreshed_access_token_456') {
        request.response.statusCode = 200;
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode({
          'success': true,
          'statusCode': 200,
          'data': {'secret': 'kumaran_data', 'counter': protectedEndpointCount},
        }));
        await request.response.close();
        return;
      } else {
        // Reject stale/expired token
        request.response.statusCode = 401;
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode({
          'statusCode': 401,
          'message': 'Token expired',
        }));
        await request.response.close();
        return;
      }
    }

    // Default 404
    request.response.statusCode = 404;
    await request.response.close();
  });

  try {
    // --------------------------------------------------------------------------
    // Test 1: Transparent 401 token refresh and request replay
    // --------------------------------------------------------------------------
    print('Test 1: Transparent 401 token refresh and request replay...');

    final authManager = AuthSessionManager(
      getAccessToken: () async => currentAccessToken,
      getRefreshToken: () async => currentRefreshToken,
      onTokenRefreshed: (newAccess, newRefresh) async {
        currentAccessToken = newAccess;
        currentRefreshToken = newRefresh ?? currentRefreshToken;
      },
      onUnauthorized: () async {
        unauthorizedCallbackCalled = true;
      },
    );

    final client = KumaranMobileApiClient(
      baseUrl: baseUrl,
      authManager: authManager,
    );

    final response = await client.request(
      method: 'GET',
      path: '/api/v1/protected',
    );

    assertEqual(response['secret'], 'kumaran_data', 'Replayed response must contain expected data');
    assertEqual(currentAccessToken, 'refreshed_access_token_456', 'Access token must be updated');
    assertEqual(refreshRequestCount, 1, 'Exactly one refresh request should have been dispatched');
    assertEqual(unauthorizedCallbackCalled, false, 'onUnauthorized should not be called on successful refresh');
    print('  ✓ Transparent 401 refresh & request replay passed');

    // --------------------------------------------------------------------------
    // Test 2: Subsequent request uses refreshed token directly
    // --------------------------------------------------------------------------
    print('Test 2: Subsequent request uses refreshed token without 401...');
    final response2 = await client.request(
      method: 'GET',
      path: '/api/v1/protected',
    );
    assertEqual(response2['secret'], 'kumaran_data', 'Second request should succeed directly');
    assertEqual(refreshRequestCount, 1, 'No new refresh request should have been dispatched');
    print('  ✓ Subsequent request with fresh token passed');

    // --------------------------------------------------------------------------
    // Test 3: Single-flight refresh mutex under concurrent 401 requests
    // --------------------------------------------------------------------------
    print('Test 3: Single-flight refresh mutex under concurrent 401s...');
    // Reset tokens to expired state
    currentAccessToken = 'stale_token_again';
    currentRefreshToken = 'valid_refresh_token_999';
    final initialRefreshCount = refreshRequestCount;

    // Fire 5 concurrent requests simultaneously
    final futures = List.generate(
      5,
      (_) => client.request(method: 'GET', path: '/api/v1/protected'),
    );
    final results = await Future.wait(futures);

    for (final res in results) {
      assertEqual(res['secret'], 'kumaran_data', 'All 5 concurrent requests must succeed after coalesced refresh');
    }
    // Only 1 refresh request dispatched despite 5 concurrent 401s
    assertEqual(
      refreshRequestCount,
      initialRefreshCount + 1,
      'Concurrent 401s must coalesce into exactly 1 refresh call (single-flight mutex)',
    );
    print('  ✓ Single-flight refresh mutex coalescing passed');

    // --------------------------------------------------------------------------
    // Test 4: Failed refresh calls onUnauthorized and throws KumaranApiException
    // --------------------------------------------------------------------------
    print('Test 4: Expired/revoked refresh token triggers onUnauthorized and throws 401...');
    currentAccessToken = 'stale_token_final';
    currentRefreshToken = 'REVOKED_REFRESH_TOKEN'; // Will fail on server
    unauthorizedCallbackCalled = false;

    bool threw401 = false;
    try {
      await client.request(method: 'GET', path: '/api/v1/protected');
    } on KumaranApiException catch (e) {
      if (e.statusCode == 401) {
        threw401 = true;
      }
    }

    assertEqual(threw401, true, 'Client must throw KumaranApiException with statusCode 401');
    assertEqual(unauthorizedCallbackCalled, true, 'onUnauthorized callback must be triggered on failed refresh');
    print('  ✓ Failed refresh error handling passed');

    client.close();
    print('\nAll Mobile Auth & Token Refresh Tests Passed Successfully!');
  } finally {
    await serverSub.cancel();
    await server.close(force: true);
  }
}
