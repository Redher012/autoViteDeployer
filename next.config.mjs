import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include lib directory in output file tracing
  outputFileTracingIncludes: {
    '/api/**': ['./lib/**/*'],
  },
  // Increase body size limit for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // Increase body size limit for API routes when middleware is used (Next.js 16+)
    // This affects the maximum body size that can be parsed
    middlewareClientMaxBodySize: '100mb',
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native modules and server-only packages for server-side
      // These should not be bundled, but loaded at runtime
      config.externals = config.externals || [];
      
      // Don't bundle these native/server-only modules
      const serverOnlyModules = [
        'better-sqlite3',
        'fs-extra',
        'yauzl',
        'uuid',
        'puppeteer',
      ];
      
      config.externals.push(...serverOnlyModules);
      
      // Don't bundle lib files - let Node.js require them at runtime
      // Match absolute paths to lib directory
      config.externals.push(function ({ request }, callback) {
        if (request && typeof request === 'string') {
          // Match absolute paths containing lib/deployment-manager or lib/db
          if (request.includes('lib/deployment-manager') || request.includes('lib/db')) {
            // Return false to indicate this should be handled by Node.js at runtime
            return callback(null, `commonjs ${request}`);
          }
          // Also match if it's an absolute path to lib directory
          const libPath = path.resolve(__dirname, 'lib');
          if (request.startsWith(libPath)) {
            return callback(null, `commonjs ${request}`);
          }
        }
        callback();
      });
      
      // Ensure webpack can resolve modules from project root
      config.resolve = config.resolve || {};
      config.resolve.modules = config.resolve.modules || [];
      config.resolve.modules.push(path.resolve(__dirname));
      
      // Ensure .js extension is included
      config.resolve.extensions = config.resolve.extensions || ['.js', '.json'];
      if (!config.resolve.extensions.includes('.js')) {
        config.resolve.extensions.push('.js');
      }
      
      // Configure webpack to not try to resolve dynamic requires
      // This allows Node.js to handle requires at runtime
      config.module = config.module || {};
      config.module.unknownContextCritical = false;
      config.module.unknownContextRegExp = /^\.\/.*$/;
      config.module.unknownContextRequest = '.';
    }
    return config;
  },
};

export default nextConfig;
