import { Global, Module } from '@nestjs/common';
import { AiProviderFactory } from './ai-provider-factory.service.js';

// Global (same pattern as PrismaModule) so every service that generates AI
// content - and AdminService/AdminController, for reading/writing the
// override - can inject AiProviderFactory without each importing this
// module individually.
@Global()
@Module({
  providers: [AiProviderFactory],
  exports: [AiProviderFactory],
})
export class AiModule {}
