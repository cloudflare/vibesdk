import { defineConfig } from 'drizzle-kit';
// import * as dotenv from 'dotenv';
// import * as fs from 'fs';
// import * as path from 'path';

// // Load environment variables from .dev.vars
// const devVarsPath = path.join(__dirname, '.dev.vars');
// if (fs.existsSync(devVarsPath)) {
//   const devVars = fs.readFileSync(devVarsPath, 'utf-8');
//   const parsed = dotenv.parse(devVars);
//   Object.assign(process.env, parsed);
// }

export default defineConfig({
  schema: './worker/database/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
//   dbCredentials: {
//     accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
//     token: process.env.CLOUDFLARE_D1_TOKEN!,
//     databaseId: process.env.CLOUDFLARE_D1_ID!,
//   },
  verbose: true,
  strict: true,
});
