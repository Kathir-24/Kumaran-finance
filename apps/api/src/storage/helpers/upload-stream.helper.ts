import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Reads an incoming binary PUT request stream into a Buffer while enforcing
 * a strict byte ceiling mid-stream so oversized payloads cannot exhaust heap.
 */
export async function readBinaryUploadBody(
  req: Request,
  maxBytes: number,
): Promise<Buffer> {
  if (Buffer.isBuffer((req as { body?: unknown }).body)) {
    const body = (req as { body: Buffer }).body;
    if (body.length === 0) {
      throw new BadRequestException('Upload body cannot be empty');
    }
    if (body.length > maxBytes) {
      throw new PayloadTooLargeException(
        `Upload exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB`,
      );
    }
    return body;
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        if (typeof req.pause === 'function') {
          req.pause();
        }
        fail(
          new PayloadTooLargeException(
            `Upload exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB`,
          ),
        );
        return;
      }
      chunks.push(buf);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (totalBytes === 0) {
        reject(new BadRequestException('Upload body cannot be empty'));
        return;
      }
      resolve(Buffer.concat(chunks, totalBytes));
    };

    const onError = (err: Error) => fail(err);
    const onAborted = () =>
      fail(new BadRequestException('Client aborted file upload before completion'));

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}
