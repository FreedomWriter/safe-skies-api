import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRouter from './routes/auth';
import adminAuthRouter from './routes/admin-auth';
import clientMetadataRouter from './routes/clientMetadata';
import feedsRouter from './routes/feeds';
import devRouter from './routes/dev';
import profileRouter from './routes/profile';
import permissionsRouter from './routes/permissions';
import logsRouter from './routes/logs';
import moderationRouter from './routes/moderation';
import atprotoRouter from './routes/atproto';

dotenv.config();

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`Incoming request: ${req.method} ${req.url}`);
  }
  next();
});

app.use('/auth', authRouter);
app.use('/admin/auth', adminAuthRouter);
app.use('/oauth', clientMetadataRouter);
app.use('/api/feeds', feedsRouter);
app.use('/api', profileRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/logs', logsRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/atproto', atprotoRouter);

if (process.env.NODE_ENV === 'development') {
  app.use('/dev', devRouter);
}

export default app;
