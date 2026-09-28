import { startServer } from './app.js';
import { logger } from './utils/logger.js';

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
});
