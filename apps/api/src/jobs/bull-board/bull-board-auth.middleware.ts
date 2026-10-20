// ==============================================================================
// Kumaran Chits — Bull Board Basic Authentication Middleware
// Company: Kumaran Finance (Perundurai, Erode, Tamil Nadu)
// Compliance: docs/01-business/permissions-matrix.md (§1, §2)
// Restricts BullMQ visual dashboard strictly to Super Admin partners
// ==============================================================================

import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  private readonly expectedUser: string;
  private readonly expectedPass: string;

  constructor(private readonly configService: ConfigService) {
    this.expectedUser = this.configService.get<string>('BULL_BOARD_USER') || 'admin';
    this.expectedPass =
      this.configService.get<string>('BULL_BOARD_PASSWORD') || 'chitflow_secret';
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      this.sendUnauthorized(res);
      return;
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, ...passParts] = credentials.split(':');
    const password = passParts.join(':');

    if (username === this.expectedUser && password === this.expectedPass) {
      next();
      return;
    }

    this.sendUnauthorized(res);
  }

  private sendUnauthorized(res: Response): void {
    res.setHeader('WWW-Authenticate', 'Basic realm="Kumaran Chits Queue Monitor"');
    res.status(401).send('Authentication required to access Bull Board Queue Monitor');
  }
}
