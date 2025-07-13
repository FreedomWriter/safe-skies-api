import express from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { 
  searchPosts, 
  searchUsers, 
  getPosts
} from '../controllers/atproto.controller';

const router = express.Router();

// Temporary test endpoint without auth for debugging (REMOVE IN PRODUCTION)
if (process.env.NODE_ENV === 'development') {
  router.get('/test/search/posts', (req, res, next) => {
    // Mock user for testing - replace with a real DID from your database
    req.user = { 
      did: 'did:plc:test123', // Replace with actual DID from your feed_permissions table
      handle: 'test.user'
    };
    next();
  }, searchPosts);
}

// All other routes require authentication
router.use(authenticateJWT);

// Search endpoints
router.get('/search/posts', searchPosts);
router.get('/search/users', searchUsers);

// Individual item endpoints
router.get('/posts', getPosts);

export default router;
