import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContext } from '../common/context/request-context';

const prismaLogger = new Logger('PrismaService');

function withAuditLogIpExtension(baseClient: PrismaClient) {
  return baseClient.$extends({
    query: {
      auditLog: {
        create({ args, query }) {
          const ipAddress = RequestContext.getIpAddress();
          if (ipAddress && args.data && args.data.ipAddress == null) {
            args = {
              ...args,
              data: {
                ...args.data,
                ipAddress,
              },
            };
          }
          return query(args);
        },
        createMany({ args, query }) {
          const ipAddress = RequestContext.getIpAddress();
          if (ipAddress && args.data) {
            if (Array.isArray(args.data)) {
              args = {
                ...args,
                data: args.data.map((entry) =>
                  entry.ipAddress == null ? { ...entry, ipAddress } : entry,
                ),
              };
            } else if (args.data.ipAddress == null) {
              args = {
                ...args,
                data: {
                  ...args.data,
                  ipAddress,
                },
              };
            }
          }
          return query(args);
        },
      },
    },
  });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    const extended = withAuditLogIpExtension(this);
    (extended as unknown as PrismaService).onModuleInit =
      this.onModuleInit.bind(extended);
    (extended as unknown as PrismaService).onModuleDestroy =
      this.onModuleDestroy.bind(extended);
    return extended as unknown as PrismaService;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      prismaLogger.log('PostgreSQL connection pool initialized successfully.');
    } catch (err: any) {
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      prismaLogger.warn(`Non-blocking database connect notice: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {}
  }
}

