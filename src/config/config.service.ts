import { Inject, Injectable } from '@nestjs/common';
import { Config as ConfigType, configSchema } from './config.schema';
import { CONFIG_TOKEN } from './config.constants';

@Injectable()
export class ConfigService {
  private readonly config: ConfigType;

  constructor(@Inject(CONFIG_TOKEN) config: ConfigType) {
    this.config = config;
  }

  get<T extends keyof ConfigType>(key: T): ConfigType[T] {
    return this.config[key];
  }

  get all(): ConfigType {
    return this.config;
  }

  static parse(raw: Record<string, string | undefined>): ConfigType {
    const parsed = configSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Config validation failed:\n${issues}`);
    }
    return parsed.data;
  }
}
