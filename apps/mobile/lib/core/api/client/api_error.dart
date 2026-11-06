// ==============================================================================
// Kumaran Chits — Dart API Exception Wrapper
// ==============================================================================

class KumaranApiException implements Exception {
  final int statusCode;
  final String code;
  final String message;
  final List<dynamic> details;
  final int? retryAfterSeconds;

  const KumaranApiException({
    required this.statusCode,
    required this.code,
    required this.message,
    this.details = const [],
    this.retryAfterSeconds,
  });

  factory KumaranApiException.fromJson(
    int statusCode,
    dynamic json, {
    int? retryAfterSeconds,
  }) {
    if (json is Map<String, dynamic>) {
      final errorObj = json['error'];
      if (errorObj is Map<String, dynamic>) {
        return KumaranApiException(
          statusCode: statusCode,
          code: errorObj['code']?.toString() ?? (statusCode == 429 ? 'TOO_MANY_REQUESTS' : 'API_ERROR'),
          message: errorObj['message']?.toString() ?? 'An error occurred',
          details: errorObj['details'] as List<dynamic>? ?? const [],
          retryAfterSeconds: retryAfterSeconds,
        );
      }
      return KumaranApiException(
        statusCode: statusCode,
        code: json['code']?.toString() ?? (statusCode == 429 ? 'TOO_MANY_REQUESTS' : 'API_ERROR'),
        message: json['message']?.toString() ?? 'An error occurred',
        details: json['details'] as List<dynamic>? ?? const [],
        retryAfterSeconds: retryAfterSeconds,
      );
    }
    return KumaranApiException(
      statusCode: statusCode,
      code: statusCode == 429 ? 'TOO_MANY_REQUESTS' : 'API_ERROR',
      message: json?.toString() ?? 'Request failed with status $statusCode',
      retryAfterSeconds: retryAfterSeconds,
    );
  }

  bool get isRateLimited => statusCode == 429;
  bool get isUnauthorized => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isValidationError => statusCode == 400 && code == 'BAD_REQUEST';
  bool get isConflict => statusCode == 409;
  bool get isInternalServerError => statusCode >= 500;

  @override
  String toString() => 'KumaranApiException($statusCode, $code): $message${retryAfterSeconds != null ? ' (Retry-After: ${retryAfterSeconds}s)' : ''}';
}
