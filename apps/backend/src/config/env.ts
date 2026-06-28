export interface AppEnv {
  port: number;
  host: string;
  nodeEnv: string;
  frontendDevUrl: string;
}

const toPort = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

export const env: AppEnv = {
  port: toPort(process.env.PORT, 4000),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  frontendDevUrl: process.env.FRONTEND_DEV_URL ?? 'http://localhost:5173',
};
