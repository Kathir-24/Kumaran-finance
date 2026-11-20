import * as fs from 'fs';
import * as path from 'path';

interface RedisServiceConfig {
  memLimit?: string;
  command: string[];
  volumes: string[];
  rawBlock: string;
}

function resolveComposePath(fileName: string): string {
  const candidates = [
    path.resolve(__dirname, '../../../infra/docker', fileName),
    path.resolve(process.cwd(), '../../infra/docker', fileName),
    path.resolve(process.cwd(), 'infra/docker', fileName),
    path.resolve(__dirname, '../../../../infra/docker', fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate Docker compose file "${fileName}" in candidates: ${candidates.join(', ')}`);
}

function extractRedisConfig(filePath: string): RedisServiceConfig {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  let inRedis = false;
  let redisIndent = -1;
  let currentKey = '';
  let memLimit: string | undefined;
  const command: string[] = [];
  const volumes: string[] = [];
  const rawLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const indent = rawLine.search(/\S/);

    if (trimmed === 'redis:' || trimmed.startsWith('redis:')) {
      inRedis = true;
      redisIndent = indent;
      currentKey = '';
      rawLines.push(rawLine);
      continue;
    }

    if (inRedis) {
      if (indent <= redisIndent && trimmed.endsWith(':')) {
        break;
      }

      rawLines.push(rawLine);

      if (trimmed.startsWith('mem_limit:')) {
        memLimit = trimmed.split(':')[1].trim();
        currentKey = 'mem_limit';
      } else if (trimmed === 'command:' || trimmed.startsWith('command:')) {
        currentKey = 'command';
      } else if (trimmed === 'volumes:' || trimmed.startsWith('volumes:')) {
        currentKey = 'volumes';
      } else if (trimmed.endsWith(':')) {
        currentKey = '';
      } else if (trimmed.startsWith('-')) {
        const item = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '');
        if (currentKey === 'command') {
          command.push(item);
        } else if (currentKey === 'volumes') {
          volumes.push(item);
        }
      }
    }
  }

  return {
    memLimit,
    command,
    volumes,
    rawBlock: rawLines.join('\n'),
  };
}

describe('Redis Docker Compose Persistence & Memory Hardening (INFRA-03)', () => {
  const composeFiles = [
    { name: 'docker-compose.yml', relativePath: 'infra/docker/docker-compose.yml' },
    { name: 'docker-compose.fullstack.yml', relativePath: 'infra/docker/docker-compose.fullstack.yml' },
  ];

  composeFiles.forEach(({ name }) => {
    describe(`Configuration in ${name}`, () => {
      let redisConfig: RedisServiceConfig;
      let fullPath: string;

      beforeAll(() => {
        fullPath = resolveComposePath(name);
        expect(fs.existsSync(fullPath)).toBe(true);
        redisConfig = extractRedisConfig(fullPath);
      });

      it('defines mem_limit: 640m on redis service to prevent host OOM kills', () => {
        expect(redisConfig.memLimit).toBe('640m');
      });

      it('includes --appendonly yes and --appendfsync everysec in command array for durable AOF persistence', () => {
        expect(redisConfig.command).toContain('--appendonly');
        const appendOnlyIdx = redisConfig.command.indexOf('--appendonly');
        expect(redisConfig.command[appendOnlyIdx + 1]).toBe('yes');

        expect(redisConfig.command).toContain('--appendfsync');
        const appendFsyncIdx = redisConfig.command.indexOf('--appendfsync');
        expect(redisConfig.command[appendFsyncIdx + 1]).toBe('everysec');

        const commandJoined = redisConfig.command.join(' ');
        expect(commandJoined).toContain('--appendonly yes');
        expect(commandJoined).toContain('--appendfsync everysec');
      });

      it('includes --maxmemory 512mb and --maxmemory-policy noeviction to protect BullMQ queue integrity', () => {
        expect(redisConfig.command).toContain('--maxmemory');
        const maxMemoryIdx = redisConfig.command.indexOf('--maxmemory');
        expect(redisConfig.command[maxMemoryIdx + 1]).toBe('512mb');

        expect(redisConfig.command).toContain('--maxmemory-policy');
        const policyIdx = redisConfig.command.indexOf('--maxmemory-policy');
        expect(redisConfig.command[policyIdx + 1]).toBe('noeviction');

        const commandJoined = redisConfig.command.join(' ');
        expect(commandJoined).toContain('--maxmemory 512mb');
        expect(commandJoined).toContain('--maxmemory-policy noeviction');
      });

      it('includes --save 900 1 and --save 300 10 for RDB snapshots', () => {
        const commandJoined = redisConfig.command.join(' ');
        expect(commandJoined).toContain('--save 900 1');
        expect(commandJoined).toContain('--save 300 10');
      });

      it('mounts chitflow_redisdata:/data volume for durable storage', () => {
        expect(redisConfig.volumes).toContain('chitflow_redisdata:/data');
      });
    });
  });

  it('guarantees identical parity of Redis command parameters between dev and fullstack compose files', () => {
    const devPath = resolveComposePath('docker-compose.yml');
    const fullstackPath = resolveComposePath('docker-compose.fullstack.yml');

    const devConfig = extractRedisConfig(devPath);
    const fullstackConfig = extractRedisConfig(fullstackPath);

    expect(devConfig.memLimit).toBe(fullstackConfig.memLimit);
    expect(devConfig.command).toEqual(fullstackConfig.command);
    expect(devConfig.volumes).toEqual(fullstackConfig.volumes);
  });
});
