import { Request, Response } from 'express';
import { AtprotoAgent } from '../repos/atproto';

/**
 * Search for posts using ATProto's searchPosts endpoint
 * Supports pagination via cursor parameter
 */
export const searchPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, sort, since, until, author, mentions, hashtags, limit, cursor } = req.query;
    
    // Debug logging for cursor value
    if (cursor) {
      console.log('Received cursor:', cursor, 'Type:', typeof cursor);
      
      // Log if we detect a numeric cursor (might be ATProto search API behavior)
      if (/^\d+$/.test(cursor as string)) {
        console.warn('Numeric cursor detected (ATProto search API behavior):', cursor);
        // Don't reject - let's see if ATProto accepts it
      }
    }
    
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    // Build search parameters
    const searchParams: any = {
      q: q as string,
    };

    // Add optional parameters if provided
    if (sort && typeof sort === 'string') searchParams.sort = sort;
    if (since && typeof since === 'string') searchParams.since = since;
    if (until && typeof until === 'string') searchParams.until = until;
    if (author && typeof author === 'string') searchParams.author = author;
    if (mentions && typeof mentions === 'string') searchParams.mentions = mentions;
    if (hashtags && typeof hashtags === 'string') searchParams.hashtags = hashtags;
    if (limit) searchParams.limit = parseInt(limit as string) || 25;
    if (cursor && typeof cursor === 'string') searchParams.cursor = cursor;

    const response = await AtprotoAgent.app.bsky.feed.searchPosts(searchParams);

    // Debug logging for response cursor
    console.log('ATProto response cursor:', response.data.cursor, 'Type:', typeof response.data.cursor);

    const responseData: any = {
      posts: response.data.posts,
    };

    // Only include cursor if it exists and is not a simple numeric string
    // ATProto search API has a known bug where it returns invalid numeric cursors
    if (response.data.cursor && !/^\d+$/.test(response.data.cursor)) {
      responseData.cursor = response.data.cursor;
    } else if (response.data.cursor) {
      console.warn('Filtering out invalid numeric cursor from ATProto:', response.data.cursor);
    }

    res.json(responseData);
  } catch (error) {
    console.error('Error searching posts:', error);
    res.status(500).json({ error: 'Failed to search posts' });
  }
};

/**
 * Search for users/actors using ATProto's searchActors endpoint
 * Supports pagination via cursor parameter
 */
export const searchUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, limit, cursor } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const searchParams: any = {
      q: q as string,
      limit: limit ? parseInt(limit as string) : 25,
    };

    // Add cursor for pagination if provided
    if (cursor && typeof cursor === 'string') searchParams.cursor = cursor;

    const response = await AtprotoAgent.app.bsky.actor.searchActors(searchParams);

    res.json({
      actors: response.data.actors,
      cursor: response.data.cursor,
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
};

/**
 * Get posts by their AT-URIs using the app.bsky.feed.getPosts endpoint
 */
export const getPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uris } = req.query;
    
    if (!uris) {
      res.status(400).json({ error: 'Query parameter "uris" is required' });
      return;
    }

    // Parse uris - can be a single URI or comma-separated list
    let uriList: string[];
    if (typeof uris === 'string') {
      uriList = uris.split(',').map(uri => uri.trim());
    } else if (Array.isArray(uris)) {
      uriList = uris as string[];
    } else {
      res.status(400).json({ error: 'Invalid uris parameter format' });
      return;
    }

    // Validate URI limit (max 25 per API spec)
    if (uriList.length > 25) {
      res.status(400).json({ error: 'Maximum 25 URIs allowed per request' });
      return;
    }

    const response = await AtprotoAgent.app.bsky.feed.getPosts({
      uris: uriList,
    });

    res.json({
      posts: response.data.posts,
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
};
