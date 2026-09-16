import { registerAs } from '@nestjs/config';

export default registerAs('config', () => {
  return {
    database: {
      name: process.env.DATABASE_NAME,
      port: process.env.DATABASE_PORT,
    },
    postgres: {
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
    },
    apiKey: process.env.API_KEY,
    apiKeyProd: process.env.API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    apiKeyResend: process.env.API_KEY_RESEND,
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    nameApplicationLastFM: process.env.NAME_APPLICATION_LAST_FM,
    apiKeyLastFM: process.env.API_KEY_LAST_FM,
    sharedSecretLastFM: process.env.SHARED_SECRET_LAST_FM,
    registeredToLastFM: process.env.REGISTERED_TO_LAST_FM,
    lrcLibUrl: process.env.LRCLIB_URL,
    youtubeCacheTtlHours: parseInt(
      process.env.YOUTUBE_CACHE_TTL_HOURS || '6',
      10,
    ),
  };
});
