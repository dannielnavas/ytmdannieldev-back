import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync } from 'fs';

let server: ((req: any, res: any) => void) | null = null;

export async function createNestServer(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Lista de orígenes permitidos
  const allowedOrigins = ['http://localhost:4200'];

  // Configuración CORS para orígenes específicos

  app.enableCors({
    origin: (origin, callback) => {
      // Permitir peticiones sin origen (como herramientas tipo Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
      'X-API-Key',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: [
      'Authorization',
      'X-Total-Count',
      'Accept-Ranges',
      'Content-Range',
      'Content-Length',
    ],
    credentials: true, // Ahora puede ser true con orígenes específicos
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400, // Cache preflight por 24 horas
  });

  // Middleware adicional para asegurar headers CORS en todas las respuestas
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin;

    // Verificar si el origen está en la lista permitida
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    res.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD',
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers, X-API-Key, Cache-Control, Pragma',
    );
    res.header('Access-Control-Max-Age', '86400');
    res.header(
      'Access-Control-Expose-Headers',
      [
        'Authorization',
        'X-Total-Count',
        'Accept-Ranges',
        'Content-Range',
        'Content-Length',
      ].join(', '),
    );

    // Manejar peticiones OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  });

  // TODO: va a quitar del payload todos los atributos que no esten definidos en el dto -with whitelist
  // TODO con forbidNonWhitelisted se alerta en la respuesta de la api que se envia un atributo que no esta definido en el dto
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      // TODO: transforma de froma implicita los tipos de datos, cuando sea un objeto
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Configurar archivos estáticos para Swagger UI si existen localmente
  const swaggerDistPath = join(
    import.meta.dirname,
    '..',
    'node_modules',
    'swagger-ui-dist',
  );
  if (existsSync(swaggerDistPath)) {
    app.useStaticAssets(swaggerDistPath, {
      prefix: '/docs/',
    });
  }

  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription('My Tracker API')
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'My Tracker API',
    customfavIcon: '/docs/favicon-32x32.png',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js',
    ],
    customCssUrl: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.css',
    ],
  });

  return app;
}

// Handler para Vercel Serverless Functions
export default async function handler(req: any, res: any) {
  try {
    if (!server) {
      const app = await createNestServer();
      await app.init();
      server = app.getHttpAdapter().getInstance();
    }
    return server(req, res);
  } catch (error) {
    console.error('Error in Vercel Serverless handler bootstrap:', error);
    if (!res.headersSent) {
      res.status(500).json({
        statusCode: 500,
        message: 'Serverless Function Bootstrap Failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Ejecución local (Nest watch, dev, standalone node)
if (!process.env.VERCEL) {
  const app = await createNestServer();
  await app.listen(process.env.PORT ?? 3000);
}
