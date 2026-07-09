import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // rawBody: true is required for Stripe webhook signature verification
  // (billing.controller.ts reads req.rawBody), which needs the exact bytes
  // Stripe signed, not the JSON-parsed-and-reserialized body.
  const app = await NestFactory.create(AppModule, { cors: true, rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  console.log(`german-smart-apply API listening on port ${port}`);
}

void bootstrap();
