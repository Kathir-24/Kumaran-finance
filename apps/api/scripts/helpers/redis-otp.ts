// ==============================================================================
// Kumaran Chits — E2E Test Runner OTP Extractor Helper
// Automatically extracts real OTP from API responses or container logs
// ==============================================================================

import { execSync } from 'child_process';

/**
 * Extracts a valid 6-digit OTP code for automated testing:
 * 1. Checks if `debugOtp` was included in the API response (development mode).
 * 2. If suppressed (production mode), safely inspects the MockSmsDriver log from chitflow-api.
 * 3. Falls back to '123456'.
 */
export function extractOtpCode(responseJson: any): string {
  if (responseJson?.data?.debugOtp && /^\d{6}$/.test(responseJson.data.debugOtp)) {
    return responseJson.data.debugOtp;
  }

  try {
    const logs = execSync('docker logs --tail 30 chitflow-api', { encoding: 'utf-8' });
    const matches = [...logs.matchAll(/verification code is (\d{6})/g)];
    if (matches.length > 0) {
      return matches[matches.length - 1][1];
    }
  } catch {
    // If docker is unavailable or headless
  }

  return '123456';
}
