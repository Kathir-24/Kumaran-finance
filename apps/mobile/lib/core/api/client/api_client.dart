// ==============================================================================
// Kumaran Chits — Dart Mobile API Client
// Handles JSON serialization, headers, idempotency, and error handling.
// ==============================================================================

import 'dart:convert';
import 'dart:io';
import 'api_error.dart';
import 'auth_interceptor.dart';
import 'idempotency_interceptor.dart';

class KumaranMobileApiClient {
  final String baseUrl;
  final AuthSessionManager? authManager;
  final HttpClient _httpClient;

  KumaranMobileApiClient({
    this.baseUrl = 'http://10.0.2.2:3000', // Standard Android Emulator localhost mapping
    this.authManager,
    HttpClient? httpClient,
  }) : _httpClient = httpClient ?? HttpClient() {
    _httpClient.connectionTimeout = const Duration(seconds: 15);
  }

  /// Executes an HTTP request with Bearer Auth, Idempotency-Key, transparent 401 refresh, and error unwrapping
  Future<Map<String, dynamic>> request({
    required String method,
    required String path,
    Map<String, dynamic>? queryParameters,
    Map<String, dynamic>? body,
    Map<String, String>? customHeaders,
    bool isRetry = false,
  }) async {
    final uri = _buildUri(path, queryParameters);
    final request = await _httpClient.openUrl(method, uri);

    // Standard headers
    request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
    request.headers.set(HttpHeaders.acceptHeader, 'application/json');

    // Inject Bearer Token
    if (authManager != null) {
      final authHeaders = await authManager!.getAuthHeaders();
      authHeaders.forEach((k, v) => request.headers.set(k, v));
    }

    // Auto-inject Idempotency-Key on financial mutations
    if (IdempotencyHelper.requiresIdempotency(method, path)) {
      if (customHeaders == null || !customHeaders.containsKey('Idempotency-Key')) {
        request.headers.set('Idempotency-Key', IdempotencyHelper.generateUuidV4());
      }
    }

    // Custom headers
    if (customHeaders != null) {
      customHeaders.forEach((k, v) => request.headers.set(k, v));
    }

    // Body
    if (body != null) {
      final jsonBody = jsonEncode(body);
      request.write(jsonBody);
    }

    final response = await request.close();
    final responseBody = await response.transform(utf8.decoder).join();

    dynamic parsedJson;
    try {
      parsedJson = jsonDecode(responseBody);
    } catch (_) {
      parsedJson = responseBody;
    }

    if (response.statusCode >= 400) {
      // 401 Unauthorized handling: attempt single-flight token rotation and replay (F14)
      if (response.statusCode == 401 && !isRetry && authManager != null) {
        final refreshed = await authManager!.refreshToken(baseUrl, _httpClient);
        if (refreshed) {
          // Replay original request with refreshed access token
          return await this.request(
            method: method,
            path: path,
            queryParameters: queryParameters,
            body: body,
            customHeaders: customHeaders,
            isRetry: true,
          );
        }
      }

      if (response.statusCode == 401 && authManager?.onUnauthorized != null) {
        await authManager!.onUnauthorized!();
      }
      final retryAfterStr = response.headers.value('retry-after');
      final retryAfter = retryAfterStr != null ? int.tryParse(retryAfterStr) : null;
      throw KumaranApiException.fromJson(
        response.statusCode,
        parsedJson,
        retryAfterSeconds: retryAfter,
      );
    }

    if (parsedJson is Map<String, dynamic>) {
      // Unwrap standard response envelope: { success: true, statusCode: 200, data: ... }
      if (parsedJson.containsKey('data') && parsedJson['data'] is Map<String, dynamic>) {
        return parsedJson['data'] as Map<String, dynamic>;
      }
      return parsedJson;
    }

    return {'result': parsedJson};
  }

  Uri _buildUri(String path, Map<String, dynamic>? queryParameters) {
    final cleanBase = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final fullUrl = '$cleanBase$cleanPath';

    if (queryParameters == null || queryParameters.isEmpty) {
      return Uri.parse(fullUrl);
    }

    final stringParams = queryParameters.map((k, v) => MapEntry(k, v?.toString() ?? ''));
    return Uri.parse(fullUrl).replace(queryParameters: stringParams);
  }

  void close() {
    _httpClient.close();
  }
}
