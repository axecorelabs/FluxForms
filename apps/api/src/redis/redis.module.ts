import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS = 'REDIS';

function makeRedisClient(): Redis {
  const raw = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const url = new URL(raw);
  return new Redis({
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    // Reconnect on disconnect (network blip, container restart, etc.)
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: false,
  });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: makeRedisClient,
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
