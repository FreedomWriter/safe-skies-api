# SAFEskies API :shield:

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

SAFEskies API is the backend for SAFEskies (Software Against a Fearful Environment)—a Node.js/Express API that handles authentication, profile management, feed permissions, and moderation/reporting for the SAFEskies project. This API uses PostgreSQL (or a Supabase instance) for persistence and provides endpoints for OAuth authentication with BlueSky (Atproto), as well as endpoints to report posts, manage moderation, and more.

**Live Application**: API powers the frontend at [www.safeskies.app](https://www.safeskies.app)

## Table of Contents

- [SAFEskies API :shield:](#safeskies-api-shield)
  - [Table of Contents](#table-of-contents)
  - [⚠️ Stability Warning](#️-stability-warning)
  - [Features](#features)
  - [Setup](#setup)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Environment Variables](#environment-variables)
    - [Database Migrations](#database-migrations)
    - [Database Backups and Restoration](#database-backups-and-restoration)
      - [How Backups Work](#how-backups-work)
      - [Managing Backups](#managing-backups)
      - [Restoration Process](#restoration-process)
  - [Running the Server](#running-the-server)
    - [Local Development Auth/Client](#local-development-authclient)
    - [Available Scripts](#available-scripts)
  - [API Endpoints](#api-endpoints)
    - [Authentication](#authentication)
    - [Moderation / Reporting](#moderation--reporting)
  - [Testing](#testing)
    - [Testing Strategy](#testing-strategy)
    - [Test Structure](#test-structure)
    - [Mocking Pattern](#mocking-pattern)
    - [Running Tests](#running-tests)
  - [Development Tools](#development-tools)
  - [Contributing](#contributing)
    - [Current Contribution Priorities](#current-contribution-priorities)
    - [Contribution Process](#contribution-process)
  - [License](#license)
  - [Maintainer](#maintainer)

## ⚠️ Stability Warning

**IMPORTANT**: SAFEskies API is currently in an alpha state of development. The application is functional but subject to significant changes as we work toward a stable release.

You should be aware of the following:

- The API interfaces may change without backward compatibility
- Database schema and data structures could be modified between versions
- Authentication mechanisms might evolve as we stabilize the architecture
- Documentation is still evolving along with the application

We encourage testing and feedback but recommend caution when using SAFEskies API in production environments at this stage.

## Features

- **OAuth Authentication:**
  Supports BlueSky OAuth flows with persistent session storage using custom persistent stores.
- **Profile Management:**
  Automatically creates or updates user profiles on login.
- **Feed Permissions:**
  Manages feed roles with a clear hierarchy (`admin`, `mod`, `user`).
- **Moderation Logging & Reporting:**
  Logs moderation actions (post deletion/restoration, user bans/unbans, mod promotions/demotions) in a dedicated `logs` table and provides endpoints for reporting posts.
- **Client Metadata Endpoint:**
  Serves OAuth client metadata for discovery.
- **Automated Backups:**
  Creates automatic backups during schema migrations with easy restoration options.

## Setup

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **PostgreSQL** (or a Supabase instance)
- **npm** (v9 or higher)

### Installation

1. **Clone the Repository:**

   ```bash
   git clone https://github.com/blacksky-algorithms/safe-skies-api.git
   cd safe-skies-api
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

### Environment Variables

Copy the sample file and update with your configuration:

```bash
cp .env.sample .env
```

Example `.env.sample`:

```bash
PORT=5000
PGUSER=your_PGUSER
PGPASSWORD=your_PGPASSWORD
PGHOST=your_PGHOST
PGDATABASE=your_PGDATABASE
PGPORT=your_PGPORT


# Encryption key must be a base64-encoded 32-byte key
ENCRYPTION_KEY=your_base64_32byte_key

# BlueSky / Atproto configuration
BSKY_BASE_API_URL=https://api.bsky.app


# Client URL to which users are redirected after authentication
CLIENT_URL=https://your-frontend-url.com

# Base URL for the backend server
BASE_URL=https://your-backend-url.com

# JWT secret key for token exchange with client
JWT_SECRET=

# RSKY Feedgen URL
RSKY_FEEDGEN=at://did:plc:w4xbfzo7kqfes5zb7r6qv3rw/app.bsky.feed.generator/blacksky

# RSKY API Key
RSKY_API_KEY=
```

### Database Migrations

This project uses Knex.js to manage your database schema.

- **Create a Migration:**

  ```bash
  npm run migrate:create migration_name
  ```

- **Run Migrations:**

  ```bash
  npm run migrate:up
  ```

- **Rollback Migrations:**

  ```bash
  npm run migrate:down
  ```

When running migrations down, the system automatically creates backup tables with timestamps for all affected data.

### Database Backups and Restoration

#### How Backups Work

- Automatic backups are created before any `migrate:down` operation.
- Each backup is tagged with a timestamp (format: YYYYMMDD_HHMMSS).
- Backups include:
  - Table data
  - Enum values
  - Constraints and indexes
  - Row Level Security policies

#### Managing Backups

Available PostgreSQL functions:

- **List Backups:**

  ```sql
  SELECT * FROM list_backups();
  ```

- **Restore a Backup:**

  ```sql
  SELECT restore_from_backup('20250222_103045');  -- Replace with your backup timestamp.
  ```

- **Clean Up Old Backups:**

  ```sql
  SELECT cleanup_old_backups(30);  -- Removes backups older than 30 days.
  ```

#### Restoration Process

1. List available backups:

   ```sql
   SELECT * FROM list_backups();
   ```

2. Choose a backup timestamp.

3. Restore the backup:

   ```sql
   SELECT restore_from_backup('YOUR_BACKUP_TIMESTAMP');
   ```

4. Verify your data after restoration.

## Running the Server (with Docker)

Getting the entire backend running with docker takes a few steps:

1. If you don't have Docker installed or would like to proceed without it you can skip this part and continue following the steps below. If you would like to try running the backend with Docker you can [install it here](https://www.docker.com/)

2. Update your `.env` file

```diff
- PGHOST=127.0.0.1
+ PGHOST=db
```

3. Start the backend

```bash
docker compose up -d
```

## Running the Server (without Docker)

The server can be run in different modes:

```bash
# Development mode with ts-node-dev (auto-reloading)
npm run dev

# Production mode
npm start

# Build the TypeScript code
npm run build
```

When running in development mode with `npm run dev`, ts-node-dev will automatically restart the server when changes are made. The server will run on the port specified in your `.env` file (default is 5000).

### Local Development Auth/Client

For development locally when working on auth features or the [client](https://github.com/blacksky-algorithms/SAFEskies/blob/main/.env.sample), you'll need to expose your local server to the public internet and update your client `NEXT_PUBLIC_SAFE_SKIES_API` environment variable with the ngrok url:

1. **Using ngrok**:

   ```bash
   # Install ngrok globally
   npm install -g ngrok

   # Expose your local server
   ngrok http 5000
   ```

2. **Update your environment variables**:

   ```node
   BASE_URL=https://your-ngrok-url.ngrok.io
   ```

This setup allows OAuth providers to redirect back to your local development environment.

### Available Scripts

- `npm run dev`: Starts the development server with auto-reloading.
- `npm run build`: Compiles TypeScript to JavaScript.
- `npm start`: Runs the compiled code in production.
- `npm test`: Runs Jest tests.
- `npm run test:watch`: Runs tests in watch mode.
- `npm run test:coverage`: Runs tests with coverage report.
- `npm run test:e2e`: Runs Postman collection tests using Newman.
- `npm run lint`: Runs Biome for code quality.
- `npm run format`: Formats code using Biome.
- `npm run migrate:create`: Creates a new migration file.
- `npm run migrate:up`: Runs pending migrations.
- `npm run migrate:down`: Rolls back the most recent migration.

## API Endpoints

### Authentication

- **GET /auth/signin**
  Initiates the OAuth flow.
  Query Parameters:

  - `handle`: A login hint (e.g., the user handle).

  Response:
  Returns a JSON object with an authorization URL.

- **GET /auth/callback**
  Handles the OAuth callback. Processes the OAuth response, upserts the user profile, sets an HTTP-only cookie, and redirects to the client URL.

- **POST /auth/logout**
  Logs the user out by clearing the session cookie.

- **GET /oauth/client-metadata.json**
  Serves the OAuth client metadata for discovery.

### Moderation / Reporting

- **POST /moderation/report**
  Accepts a JSON payload (or an array of payloads) to report a post. The payload includes:

  - `targetedPostUri`
  - `reason`
  - `toServices` (array of moderation services)
  - `targetedUserDid`
  - `uri`
  - `feedName`
  - `additionalInfo`
  - `action`
  - Optional metadata fields.

  Response:
  Returns a summary of the processing of each report.

### ATProto Proxy (Authenticated)

All ATProto proxy endpoints require authentication via JWT token.

**⚡ Performance Note**: These endpoints prioritize fast response times by acting as direct proxies to ATProto's search APIs. For moderation workflows, we recommend using dedicated moderation endpoints rather than trying to determine moderation context during search, as this significantly improves performance.

**⚠️ Pagination Limitation**: Due to a known issue in ATProto's search API ([#3583](https://github.com/bluesky-social/atproto/issues/3583)), pagination may be limited. The API sometimes returns invalid cursors that cause errors. Our implementation filters out these invalid cursors to prevent errors.

- **GET /api/atproto/search/posts**
  Search for posts using ATProto's searchPosts endpoint.
  Query Parameters:
  - `q` (required): Search query string
  - `sort`: Sort order (optional)
  - `since`: Start date filter (optional)
  - `until`: End date filter (optional)
  - `author`: Filter by author (optional)
  - `mentions`: Filter by mentions (optional)
  - `hashtags`: Filter by hashtags (optional)
  - `limit`: Number of results (default: 25, max: 100)
  - `cursor`: Pagination cursor for next page (optional)

  Response:
  Returns posts and cursor for pagination in standard ATProto format.

- **GET /api/atproto/search/users**
  Search for users/actors using ATProto's searchActors endpoint.
  Query Parameters:
  - `q` (required): Search query string
  - `limit`: Number of results (default: 25)
  - `cursor`: Pagination cursor for next page (optional)

  Response:
  Returns actors and cursor for pagination.

- **GET /api/atproto/posts**
  Get posts by their AT-URIs using the getPosts endpoint.
  Query Parameters:
  - `uris` (required): Comma-separated list of AT-URIs (max 25)

  Response:
  Returns array of posts in standard ATProto format.

#### Recommended Moderation Workflow

For applications requiring moderation context, we recommend the following workflow:

1. **Search/Discovery**: Use the fast ATProto proxy endpoints (`/api/atproto/search/posts`, `/api/atproto/search/users`) for post discovery and search functionality
2. **Moderation Check**: For posts that need moderation context, use dedicated moderation services (e.g., Blacksky labeler) or the `/moderation/report` endpoint
3. **Reporting**: Use `/moderation/report` to submit posts for moderation review when needed

This separation ensures optimal performance for search operations while maintaining comprehensive moderation capabilities through specialized services.

#### Pagination Example

Both search endpoints support cursor-based pagination:

```bash
# First page
GET /api/atproto/search/posts?q=bluesky&limit=10

# Response:
{
  "posts": [...],
  "cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNS0wNy0xM1QxMDowMDowMFoifQ"
}

# Next page using the cursor
GET /api/atproto/search/posts?q=bluesky&limit=10&cursor=eyJjcmVhdGVkX2F0IjoiMjAyNS0wNy0xM1QxMDowMDowMFoifQ

# Continue until no cursor is returned (end of results)
```

**TODO:** Add detailed API documentation for each endpoint.

## Testing

SAFEskies API uses Jest for unit testing with a structured mocking pattern to ensure consistent and maintainable tests.

### Testing Strategy

The testing approach focuses on:

- **Unit tests** for individual functions and modules
- **Integration tests** for API endpoints using Supertest
- **Isolated testing** using comprehensive mocks
- **Centralized mock definitions** for consistency and reusability
- **Clear setup patterns** that follow a consistent structure

### Test Structure

Tests are organized in the `test` directory with:

- `fixtures`: Sample data for consistent test scenarios
- `mocks`: Centralized mock definitions for various modules (database, JWT, API clients, etc.)
- `unit`: Tests for individual functions and components
- `integration`: End-to-end tests that verify endpoint behavior

### Mocking Pattern

The project follows a consistent mocking pattern:

1. **Centralized mock definitions**:

   ```typescript
   // Example from logs.mocks.ts
   export const mockGetLogs = jest
     .fn<Promise<LogEntry[]>, [LogFilters]>()
     .mockResolvedValue(mockLogEntries);

   export const mockCreateModerationLog = jest
     .fn()
     .mockResolvedValue(undefined);

   // Setup function
   export const setupLogsMocks = (): void => {
     jest.mock("../../src/repos/logs", () => ({
       getLogs: mockGetLogs,
       createModerationLog: mockCreateModerationLog,
     }));
   };
   ```

2. **Authentication mocking**:

   ```typescript
   // Example from auth.mocks.ts
   export const mockJwtSign = jest.fn().mockReturnValue(mockToken);
   export const mockJwtVerify = jest.fn().mockImplementation(() => adminUser);

   export const setupAuthMocks = (): void => {
     jest.mock("jsonwebtoken", () => ({
       sign: mockJwtSign,
       verify: mockJwtVerify,
     }));
     // Other auth-related mocks...
   };
   ```

3. **Express request/response mocking**:

   ```typescript
   // Example usage in controller tests
   import {
     createMockRequest,
     createMockResponse,
   } from "../mocks/express.mock";

   it("should handle the request", async () => {
     const req = createMockRequest({
       user: { did: mockAdmin.did },
       query: { limit: "10" },
     });
     const res = createMockResponse();

     await myController(req, res);

     expect(res.status).toHaveBeenCalledWith(200);
   });
   ```

4. **Integration testing pattern**:

   ```typescript
   // Example integration test
   import request from "supertest";
   import app from "../../../src/app";
   import { setupAuthMocks, mockJwtVerify } from "../../mocks/auth.mocks";
   import { setupLogsMocks } from "../../mocks/logs.mocks";

   // Setup mocks before testing
   setupAuthMocks();
   setupLogsMocks();

   describe("API Endpoint", () => {
     it("should return expected response", async () => {
       const response = await request(app)
         .get("/api/route")
         .set("Authorization", "Bearer token");

       expect(response.status).toBe(200);
     });
   });
   ```

### Running Tests

Run the test suite with one of the following commands:

```bash
# Run all tests
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Development Tools

- **Express**: HTTP server framework.
- **Knex**: SQL query builder for PostgreSQL.
- **ts-node-dev**: TypeScript execution and development environment with auto-reloading.
- **Helmet**: Security headers.
- **CORS**: Cross-Origin Resource Sharing.
- **Morgan**: HTTP request logging.
- **TypeScript**: Static typing.
- **Jest & Supertest**: Testing.
<!-- - **Newman**: Command-line collection runner for Postman. -->
- **Biome**: Code quality.
- **Husky**: Git hooks for code quality.
- **Zod**: TypeScript-first schema validation.

## Contributing

SAFEskies welcomes community contributions, but please note our current development phase focuses on establishing stability before implementing major new features.

### Current Contribution Priorities

- Bug fixes and stability improvements
- Documentation improvements
- Test coverage expansion
- Security enhancements

### Contribution Process

1. **Check Existing Issues**: Review open issues to see if your concern is already being addressed.

2. **Open an Issue First**: Before submitting code changes, please open an issue to discuss your proposed changes.

   - For bugs, include reproduction steps and expected behavior
   - For features, explain the use case and implementation approach

3. **Development Workflow**:

   ```bash
   # Fork and clone the repository
   git clone https://github.com/your-username/SAFEskies.git
   cd SAFEskies

   # Create a descriptive feature branch
   git checkout -b fix/issue-description

   # Install dependencies
   npm install

   # Make your changes with tests
   # Run tests to ensure no regressions
   npm test
   ```

4. **Code Standards**:

   - Follow existing code style patterns
   - Include comments for complex logic
   - Add tests for new functionality
   - Update documentation to reflect changes
   - Follow the established testing and mocking patterns

5. **Pull Request Process**:
   - Ensure all tests pass
   - Reference the related issue in your PR
   - Provide a clear description of changes
   - Be responsive to review feedback

The maintainer will review PRs on a regular basis, prioritizing stability-focused contributions during this alpha development phase.

## License

This project is licensed under the MIT License.

## Maintainer

Maintainer: Natalie Davis ([@codefreedomritr.bsky.social](https://bsky.app/profile/codefreedomritr.bsky.social))
