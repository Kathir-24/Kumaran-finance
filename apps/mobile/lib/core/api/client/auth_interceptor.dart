// ==============================================================================
// Kumaran Chits — Dart Auth & Token Refresh Interceptor
// Manages Bearer token injection and transparent 401 refresh token rotation.
// ==============================================================================

typedef TokenGetter = Future<String?> Function();
typedef TokenRefreshedCallback = Future<void> Function(String accessToken, String? refreshToken);
typedef UnauthorizedCallback = Future<void> Function();

class AuthSessionManager {
  final TokenGetter getAccessToken;
  final TokenGetter? getRefreshToken;
  final TokenRefreshedCallback? onTokenRefreshed;
  final UnauthorizedCallback? onUnauthorized;

  AuthSessionManager({
    required this.getAccessToken,
    this.getRefreshToken,
    this.onTokenRefreshed,
    this.onUnauthorized,
  });

  /// Formats the Authorization Bearer header
  Future<Map<String, String>> getAuthHeaders() async {
    final token = await getAccessToken();
    if (token != null && token.isNotEmpty) {
      return {'Authorization': 'Bearer $token'};
    }
    return {};
  }
}
