const fs = require('fs-extra');
const fsNative = require('fs'); // Native fs for sync operations
const path = require('path');
const { execSync, spawn } = require('child_process');
const yauzl = require('yauzl');
const { promisify } = require('util');
const db = require('./db');

const DEPLOYMENTS_DIR = path.join(process.cwd(), 'deployments');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const SCREENSHOTS_DIR = path.join(process.cwd(), 'public', 'screenshots');

// Ensure directories exist
fs.ensureDirSync(DEPLOYMENTS_DIR);
fs.ensureDirSync(UPLOADS_DIR);
fs.ensureDirSync(SCREENSHOTS_DIR);

// Port management - start from 3001 (3000 is usually Next.js)
let currentPort = 3001;
const MAX_PORT = 9999;

function getNextPort() {
  const stmt = db.prepare('SELECT port FROM deployments WHERE port IS NOT NULL ORDER BY port DESC LIMIT 1');
  const result = stmt.get();
  
  if (result && result.port) {
    currentPort = result.port + 1;
  }
  
  if (currentPort > MAX_PORT) {
    currentPort = 3001; // Wrap around
  }
  
  return currentPort++;
}

/** Returns true if the port is in use (so we should skip it). */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => {
      resolve(true);
      server.close();
    });
    server.once('listening', () => {
      resolve(false);
      server.close();
    });
    server.listen(port, '0.0.0.0');
  });
}

/** Get next port that is not in use (avoids EADDRINUSE on server). */
async function getNextAvailablePort() {
  const maxAttempts = 500;
  let port = getNextPort(); // Call once; getNextPort() re-queries DB so would otherwise return same port every time
  for (let i = 0; i < maxAttempts; i++) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      if (i > 0) {
        console.log(`[PORT] Using port ${port} (after skipping ${i} in-use port(s))`);
      }
      return port;
    }
    console.log(`[PORT] Port ${port} is in use, trying next...`);
    port++;
    if (port > MAX_PORT) port = 3001;
  }
  throw new Error('Could not find an available port after ' + maxAttempts + ' attempts');
}

function generateSubdomain(siteName) {
  // Convert site name to valid subdomain
  const subdomain = siteName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Check if subdomain already exists
  const stmt = db.prepare('SELECT COUNT(*) as count FROM deployments WHERE subdomain = ?');
  const existing = stmt.get(subdomain);
  
  if (existing.count > 0) {
    // Append timestamp to make it unique
    return `${subdomain}-${Date.now()}`;
  }
  
  return subdomain;
}

async function unzipFile(zipPath, extractTo, options = {}) {
  const { maxExtractedSize = 50 * 1024 * 1024, checkZipBomb = false } = options; // 50MB default
  let totalExtracted = 0;
  const resolvedPaths = new Set();
  
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      
      zipfile.readEntry();
      
      zipfile.on('entry', (entry) => {
        // Skip macOS metadata files and folders
        if (entry.fileName.includes('__MACOSX') || entry.fileName.startsWith('._')) {
          zipfile.readEntry();
          return;
        }
        
        // Path traversal protection: normalize and check if path stays within extractTo
        const normalizedEntry = path.normalize(entry.fileName).replace(/\\/g, '/');
        const resolvedPath = path.resolve(extractTo, normalizedEntry);
        const resolvedExtractTo = path.resolve(extractTo);
        
        // Ensure the resolved path is within the extract directory
        // Use path.relative to check if path stays within extractTo
        const relativePath = path.relative(resolvedExtractTo, resolvedPath);
        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          console.warn(`[UNZIP] Blocked path traversal attempt: ${entry.fileName}`);
          zipfile.readEntry();
          return;
        }
        
        // Check for zip bomb: track total extracted size
        if (checkZipBomb && entry.uncompressedSize) {
          totalExtracted += entry.uncompressedSize;
          if (totalExtracted > maxExtractedSize) {
            zipfile.close();
            return reject(new Error(`Zip bomb detected: extracted size would exceed ${maxExtractedSize / 1024 / 1024}MB`));
          }
        }
        
        // Block executable files (basic check)
        const ext = path.extname(entry.fileName).toLowerCase();
        const blockedExts = ['.exe', '.bat', '.cmd', '.sh', '.bin', '.app'];
        if (blockedExts.includes(ext)) {
          console.warn(`[UNZIP] Blocked executable file: ${entry.fileName}`);
          zipfile.readEntry();
          return;
        }
        
        if (/\/$/.test(entry.fileName)) {
          // Directory entry - ensure directory exists
          const dirPath = path.join(extractTo, normalizedEntry);
          try {
            fs.ensureDirSync(dirPath);
          } catch (err) {
            // Ignore errors for directory creation
          }
          zipfile.readEntry();
        } else {
          // File entry
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              // Skip files that can't be read (like macOS metadata)
              zipfile.readEntry();
              return;
            }
            
            const filePath = path.join(extractTo, normalizedEntry);
            // Ensure parent directory exists
            fs.ensureDirSync(path.dirname(filePath));
            
            const writeStream = fs.createWriteStream(filePath);
            readStream.pipe(writeStream);
            
            writeStream.on('close', () => {
              zipfile.readEntry();
            });
            
            writeStream.on('error', (err) => {
              // Skip files that can't be written
              zipfile.readEntry();
            });
          });
        }
      });
      
      zipfile.on('end', () => resolve());
      zipfile.on('error', (err) => {
        // Don't reject on errors, just log and continue
        console.warn('Zip extraction warning:', err.message);
        resolve();
      });
    });
  });
}

async function detectProjectType(projectPath) {
  // Check package.json for dependencies
  const packageJsonPath = path.join(projectPath, 'package.json');
  
  if (!await fs.pathExists(packageJsonPath)) {
    console.log(`[DETECT] No package.json found at ${projectPath}`);
    return 'unknown';
  }
  
  try {
    const packageJson = await fs.readJson(packageJsonPath);
    const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
    
    console.log(`[DETECT] Checking dependencies in ${packageJsonPath}`);
    console.log(`[DETECT] Dependencies found: ${Object.keys(deps).slice(0, 10).join(', ')}...`);
    
    // Check for Next.js - check for "next" key (most common)
    if (deps.next) {
      console.log(`[DETECT] ✓ Detected Next.js via dependencies.next: ${deps.next}`);
      return 'nextjs';
    }
    
    // Also check for next.js (less common but possible)
    if (deps['next.js']) {
      console.log(`[DETECT] ✓ Detected Next.js via dependencies['next.js']: ${deps['next.js']}`);
      return 'nextjs';
    }
    
    // Check for Next.js config files (strong indicator)
    const nextConfigJs = path.join(projectPath, 'next.config.js');
    const nextConfigMjs = path.join(projectPath, 'next.config.mjs');
    const nextConfigTs = path.join(projectPath, 'next.config.ts');
    if (await fs.pathExists(nextConfigJs) || await fs.pathExists(nextConfigMjs) || await fs.pathExists(nextConfigTs)) {
      console.log(`[DETECT] ✓ Detected Next.js via config file (next.config.*)`);
      return 'nextjs';
    }
    
    // Check for Vite
    if (deps.vite) {
      console.log(`[DETECT] ✓ Detected Vite via dependencies.vite: ${deps.vite}`);
      return 'vite';
    }
    
    // Check for Vite plugins
    if (deps['@vitejs/plugin-react'] || deps['@vitejs/plugin-vue']) {
      console.log(`[DETECT] ✓ Detected Vite via plugin dependencies`);
      return 'vite';
    }
    
    // Check for .next folder (built Next.js app)
    const nextPath = path.join(projectPath, '.next');
    if (await fs.pathExists(nextPath)) {
      console.log(`[DETECT] ✓ Detected Next.js via .next folder`);
      return 'nextjs';
    }
    
    // Check for dist folder (built Vite app)
    const distPath = path.join(projectPath, 'dist');
    if (await fs.pathExists(distPath)) {
      console.log(`[DETECT] ✓ Detected Vite via dist folder`);
      return 'vite';
    }
    
    // Check build scripts in package.json as fallback
    if (packageJson.scripts) {
      if (packageJson.scripts.build && packageJson.scripts.build.includes('next build')) {
        console.log(`[DETECT] ✓ Detected Next.js via build script`);
        return 'nextjs';
      }
      if (packageJson.scripts.build && packageJson.scripts.build.includes('vite build')) {
        console.log(`[DETECT] ✓ Detected Vite via build script`);
        return 'vite';
      }
    }
    
    // Default to vite if no specific indicators (but log warning)
    console.log(`[DETECT] ⚠ No framework detected, defaulting to vite`);
    return 'vite';
  } catch (err) {
    console.log(`[DETECT] Error reading package.json: ${err.message}`);
    console.log(`[DETECT] Stack: ${err.stack}`);
    return 'unknown';
  }
}

async function findProjectRoot(dir) {
  // PRIORITY: Check package.json first to detect framework type accurately
  // This ensures we detect Next.js correctly even if dist folder exists
  const packageJsonPath = path.join(dir, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    const framework = await detectProjectType(dir);
    console.log(`[FIND ROOT] Found package.json at root, detected framework: ${framework}`);
    
    // If it's a project that needs building, return project type
    if (framework === 'nextjs' || framework === 'vite') {
      return { type: 'project', path: dir, framework };
    }
  }
  
  // Check subdirectories - prioritize package.json over build folders
  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const stat = await fs.stat(entryPath);
    
    if (stat.isDirectory()) {
      const subPackageJsonPath = path.join(entryPath, 'package.json');
      
      // Check package.json FIRST to detect framework
      if (await fs.pathExists(subPackageJsonPath)) {
        const framework = await detectProjectType(entryPath);
        console.log(`[FIND ROOT] Found package.json in subdirectory ${entry}, detected framework: ${framework}`);
        return { type: 'project', path: entryPath, framework };
      }
    }
  }
  
  // Fallback: Check for pre-built output folders (only if no package.json found)
  const distPath = path.join(dir, 'dist');
  if (await fs.pathExists(distPath)) {
    console.log(`[FIND ROOT] Found dist folder at root (no package.json found)`);
    return { type: 'dist', path: distPath, framework: 'vite' };
  }
  
  const nextPath = path.join(dir, '.next');
  if (await fs.pathExists(nextPath)) {
    console.log(`[FIND ROOT] Found .next folder at root (no package.json found)`);
    return { type: 'nextjs-built', path: dir, framework: 'nextjs' };
  }
  
  // Check subdirectories for build folders (fallback)
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const stat = await fs.stat(entryPath);
    
    if (stat.isDirectory()) {
      const distPath = path.join(entryPath, 'dist');
      const nextPath = path.join(entryPath, '.next');
      
      if (await fs.pathExists(nextPath)) {
        console.log(`[FIND ROOT] Found .next folder in subdirectory ${entry}`);
        return { type: 'nextjs-built', path: entryPath, framework: 'nextjs' };
      }
      
      if (await fs.pathExists(distPath)) {
        console.log(`[FIND ROOT] Found dist folder in subdirectory ${entry}`);
        return { type: 'dist', path: distPath, framework: 'vite' };
      }
    }
  }
  
  throw new Error('Could not find dist folder, .next folder, or package.json in uploaded archive');
}

async function installDependencies(projectPath) {
  return new Promise(async (resolve, reject) => {
    // Detect which package manager to use based on lock files
    const hasPnpmLock = await fs.pathExists(path.join(projectPath, 'pnpm-lock.yaml'));
    const hasNpmLock = await fs.pathExists(path.join(projectPath, 'package-lock.json'));
    const hasYarnLock = await fs.pathExists(path.join(projectPath, 'yarn.lock'));
    
    // Determine command order based on lock files
    // Add explicit timeout flags to npm to prevent network timeouts
    const npmTimeoutFlags = ['--fetch-timeout=120000', '--fetch-retry-mintimeout=30000', '--fetch-retry-maxtimeout=180000'];
    
    let commands = [];
    if (hasPnpmLock) {
      commands = [
        { cmd: 'pnpm', args: ['install'] },
        { cmd: 'npm', args: ['install', ...npmTimeoutFlags] } // Fallback to npm if pnpm not available
      ];
    } else if (hasYarnLock) {
      commands = [
        { cmd: 'yarn', args: ['install'] },
        { cmd: 'npm', args: ['install', ...npmTimeoutFlags] } // Fallback to npm if yarn not available
      ];
    } else {
      // Default: try npm first, then pnpm
      commands = [
        { cmd: 'npm', args: ['install', ...npmTimeoutFlags] },
        { cmd: 'pnpm', args: ['install'] }
      ];
    }
    
    let currentCmd = 0;
    let retryCount = 0;
    const MAX_RETRIES = 1;
    
    function tryNext() {
      if (currentCmd >= commands.length) {
        return reject(new Error('No package manager found (tried: ' + commands.map(c => c.cmd).join(', ') + ')'));
      }
      
      const { cmd, args } = commands[currentCmd];
      
      // Try to find the full path to the command
      let fullCmd = cmd;
      try {
        // Try common locations first for npm
        if (cmd === 'npm') {
          const npmPaths = ['/usr/bin/npm', '/usr/local/bin/npm', '/opt/nodejs/bin/npm'];
          for (const npmPath of npmPaths) {
            try {
              execSync(`test -x ${npmPath}`, { stdio: 'ignore' });
              fullCmd = npmPath;
              break;
            } catch (e) {
              // Try next path
            }
          }
        }
        
        // If not found in common paths, try which/command -v
        if (fullCmd === cmd) {
          const whichOutput = execSync(`which ${cmd} 2>/dev/null || command -v ${cmd}`, { 
            encoding: 'utf8',
            shell: true,
            env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin' }
          }).trim();
          if (whichOutput) {
            fullCmd = whichOutput;
          }
        }
      } catch (err) {
        // Command not found, try next
        console.log(`${cmd} not found in PATH, trying next package manager...`);
        currentCmd++;
        return tryNext();
      }
      
      // For install, we don't need node_modules/.bin yet (it will be created)
      // Use a clean PATH
      const basePath = '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin';
      
      console.log(`[INSTALL] Using clean PATH: ${basePath}`);
      
      // Create a clean environment - don't spread process.env as npm modifies PATH
      // IMPORTANT: Don't set NODE_ENV to 'production' - it will skip devDependencies (like vite)
      const cleanEnv = {
        PATH: basePath,
        HOME: process.env.HOME,
        USER: process.env.USER,
        npm_config_prefix: process.env.npm_config_prefix,
      };
      
      // Use different variable name to avoid shadowing global 'process'
      const childProcess = spawn(fullCmd, args, {
        cwd: projectPath,
        stdio: 'pipe',
        shell: true, // Use shell so npm scripts can properly execute
        env: cleanEnv
      });
      
      let output = '';
      
      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      childProcess.on('close', (code) => {
        console.log(`[INSTALL] Process exited with code ${code} for ${fullCmd}`);
        if (code === 0) {
          resolve(output);
        } else {
          // Exit code 127 means "command not found" - try next immediately
          if (code === 127) {
            console.log(`[INSTALL] ${cmd} not found (exit code 127), fullCmd was: ${fullCmd}`);
            console.log(`[INSTALL] Full output: ${output.substring(0, 500)}`);
            currentCmd++;
            if (currentCmd < commands.length) {
              return tryNext();
            }
          }
          
          // Check if it's a network timeout error
          const isNetworkError = output.includes('ETIMEDOUT') || 
                                 output.includes('network') || 
                                 output.includes('timeout') ||
                                 code === 146; // Process killed (often due to timeout)
          
          if (isNetworkError && cmd === 'npm' && retryCount < MAX_RETRIES) {
            // Retry npm once more on network errors
            retryCount++;
            console.log(`[INSTALL] Network timeout detected, retrying npm install (attempt ${retryCount}/${MAX_RETRIES})...`);
            console.log(`[INSTALL] Error output: ${output.substring(0, 500)}`);
            setTimeout(() => {
              tryNext(); // Retry the same command
            }, 2000);
            return;
          }
          
          // If command failed and it's not the last one, try next
          currentCmd++;
          if (currentCmd < commands.length) {
            console.log(`[INSTALL] ${cmd} install failed (code ${code}), trying next package manager...`);
            console.log(`[INSTALL] Error output: ${output.substring(0, 500)}`);
            tryNext();
          } else {
            const errorMsg = isNetworkError 
              ? `Network timeout during dependency installation. Please check your internet connection and try again.`
              : `Installation failed with ${cmd} (exit code ${code}): ${output.substring(0, 500)}`;
            reject(new Error(errorMsg));
          }
        }
      });
      
      childProcess.on('error', (err) => {
        console.log(`[INSTALL] Process error for ${fullCmd}: ${err.code} - ${err.message}`);
        if (err.code === 'ENOENT') {
          // Command not found, try next
          console.log(`[INSTALL] ENOENT error - command not found at ${fullCmd}`);
          currentCmd++;
          tryNext();
        } else {
          // Other error, try next command if available
          currentCmd++;
          if (currentCmd < commands.length) {
            console.log(`[INSTALL] ${cmd} error: ${err.message}, trying next package manager...`);
            tryNext();
          } else {
            reject(err);
          }
        }
      });
    }
    
    tryNext();
  });
}

async function buildProject(projectPath, framework = 'vite') {
  return new Promise(async (resolve, reject) => {
    console.log(`[BUILD] ===== BUILD PROJECT CALLED =====`);
    console.log(`[BUILD] Framework parameter: ${framework}`);
    console.log(`[BUILD] Project path: ${projectPath}`);
    
    // Detect which package manager to use based on lock files
    const hasPnpmLock = await fs.pathExists(path.join(projectPath, 'pnpm-lock.yaml'));
    const hasYarnLock = await fs.pathExists(path.join(projectPath, 'yarn.lock'));
    
    console.log(`[BUILD] Building ${framework} project at: ${projectPath}`);
    
    // Determine commands based on framework
    let commands = [];
    
    if (framework === 'nextjs') {
      // Next.js build commands
      if (hasPnpmLock) {
        commands = [
          { cmd: 'pnpm', args: ['run', 'build'] },
          { cmd: 'pnpm', args: ['next', 'build'] },
          { cmd: 'npm', args: ['run', 'build'] },
          { cmd: 'npx', args: ['next', 'build'] }
        ];
      } else if (hasYarnLock) {
        commands = [
          { cmd: 'yarn', args: ['run', 'build'] },
          { cmd: 'yarn', args: ['next', 'build'] },
          { cmd: 'npm', args: ['run', 'build'] },
          { cmd: 'npx', args: ['next', 'build'] }
        ];
      } else {
        commands = [
          { cmd: 'npm', args: ['run', 'build'] },
          { cmd: 'npx', args: ['next', 'build'] },
          { cmd: 'pnpm', args: ['run', 'build'] }
        ];
      }
    } else {
      // Vite build commands (default)
      // Check if vite exists in node_modules/.bin (common issue with PATH)
      const viteBinPath = path.join(projectPath, 'node_modules', '.bin', 'vite');
      const viteExists = fsNative.existsSync(viteBinPath);
      console.log(`[BUILD] Checking for vite at: ${viteBinPath}, exists: ${viteExists}`);
      
      if (hasPnpmLock) {
        commands = [
          { cmd: 'pnpm', args: ['run', 'build'] },
          { cmd: 'npm', args: ['run', 'build'] }, // Fallback to npm if pnpm not available
        ];
      } else if (hasYarnLock) {
        commands = [
          { cmd: 'yarn', args: ['run', 'build'] },
          { cmd: 'npm', args: ['run', 'build'] }, // Fallback to npm if yarn not available
        ];
      } else {
        // Default: try npm first, then pnpm
        commands = [
          { cmd: 'npm', args: ['run', 'build'] },
          { cmd: 'pnpm', args: ['run', 'build'] }
        ];
      }
      
      // Always add npx vite build as final fallback if vite binary exists
      if (viteExists) {
        commands.push({ cmd: 'npx', args: ['vite', 'build'] });
        console.log(`[BUILD] Added npx vite build as fallback (vite exists)`);
      }
    }
    
    console.log(`[BUILD] Build commands to try: ${commands.map(c => `${c.cmd} ${c.args.join(' ')}`).join(', ')}`);
    
    let currentCmd = 0;
    /** When a package manager ran but build failed (e.g. exit 1), keep so we don't report "no package manager found". */
    let lastBuildError = null;
    
    function tryNext() {
      if (currentCmd >= commands.length) {
        if (lastBuildError) {
          return reject(lastBuildError);
        }
        return reject(new Error('Build command failed - no package manager found (tried: ' + commands.map(c => c.cmd).join(', ') + ')'));
      }
      
      const { cmd, args } = commands[currentCmd];
      
      // Try to find the full path to the command
      let fullCmd = cmd;
      let foundPath = false;
      
      try {
        // Try common locations first for npm
        if (cmd === 'npm') {
          const npmPaths = ['/usr/bin/npm', '/usr/local/bin/npm', '/opt/nodejs/bin/npm'];
          for (const npmPath of npmPaths) {
            try {
              execSync(`test -x ${npmPath}`, { stdio: 'ignore' });
              fullCmd = npmPath;
              foundPath = true;
              console.log(`[BUILD] Found npm at: ${fullCmd}`);
              break;
            } catch (e) {
              // Try next path
            }
          }
        }
        
        // If not found in common paths, try which/command -v
        if (!foundPath) {
          try {
            const whichOutput = execSync(`which ${cmd} 2>/dev/null || command -v ${cmd}`, { 
              encoding: 'utf8',
              shell: true,
              env: { ...process.env, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin' }
            }).trim();
            if (whichOutput) {
              fullCmd = whichOutput;
              foundPath = true;
              console.log(`[BUILD] Found ${cmd} at: ${fullCmd}`);
            }
          } catch (err) {
            console.log(`[BUILD] which/command -v failed for ${cmd}: ${err.message}`);
          }
        }
      } catch (err) {
        console.log(`[BUILD] Error checking for ${cmd}: ${err.message}`);
      }
      
      if (!foundPath) {
        // Command not found, try next
        console.log(`[BUILD] ${cmd} not found in PATH, trying next package manager...`);
        currentCmd++;
        return tryNext();
      }
      
      console.log(`[BUILD] Attempting to run: ${fullCmd} ${args.join(' ')}`);
      console.log(`[BUILD] Working directory: ${projectPath}`);
      
      // Ensure node_modules/.bin is in PATH for npm scripts to find local binaries
      const nodeModulesBin = path.join(projectPath, 'node_modules', '.bin');
      
      // Check if node_modules/.bin exists (use sync version since we're in a non-async function)
      const nodeModulesBinExists = fsNative.existsSync(nodeModulesBin);
      console.log(`[BUILD] node_modules/.bin exists: ${nodeModulesBinExists} at ${nodeModulesBin}`);
      
      // Start with a clean PATH, then add project's node_modules/.bin first
      const basePath = '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin';
      const enhancedPath = nodeModulesBinExists 
        ? `${nodeModulesBin}:${basePath}`
        : basePath;
      
      console.log(`[BUILD] Enhanced PATH: ${enhancedPath}`);
      
      // Create a completely clean environment - don't spread process.env
      // npm modifies PATH when running, so we need to control it explicitly
      // IMPORTANT: Don't set NODE_ENV to 'production' - it will skip devDependencies (like vite)
      const cleanEnv = {
        PATH: enhancedPath,
        HOME: process.env.HOME || '/root',
        USER: process.env.USER || 'root',
        // Keep only essential npm config
        npm_config_prefix: process.env.npm_config_prefix,
      };
      
      const childProcess = spawn(fullCmd, args, {
        cwd: projectPath,
        stdio: 'pipe',
        shell: true, // Use shell so npm scripts can properly execute
        env: cleanEnv
      });
      
      let output = '';
      
      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      childProcess.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      childProcess.on('close', (code) => {
        console.log(`[BUILD] Process exited with code ${code} for ${fullCmd}`);
        if (code === 0) {
          resolve(output);
        } else {
          // Exit code 127 could mean npm itself wasn't found OR a script command failed
          // Check the output to see if it's npm or a script command
          const isNpmNotFound = code === 127 && output.includes('npm: not found');
          const isScriptCommandNotFound = code === 127 && (output.includes(': not found') || output.includes('command not found'));
          
          if (isNpmNotFound) {
            // npm itself wasn't found - try next package manager
            console.log(`[BUILD] ${cmd} not found (exit code 127), fullCmd was: ${fullCmd}`);
            console.log(`[BUILD] Full output: ${output.substring(0, 500)}`);
            currentCmd++;
            if (currentCmd < commands.length) {
              return tryNext();
            }
          } else if (isScriptCommandNotFound) {
            // A script command (like vite) wasn't found - check if vite exists and try npx vite build
            console.log(`[BUILD] Script command not found in build script (exit code 127)`);
            console.log(`[BUILD] Full output: ${output.substring(0, 500)}`);
            
            // Check if this is a vite error and vite exists
            if ((output.includes('vite: not found') || output.includes('vite') && output.includes('not found'))) {
              const viteBinPath = path.join(projectPath, 'node_modules', '.bin', 'vite');
              const viteExistsNow = fsNative.existsSync(viteBinPath);
              console.log(`[BUILD] Detected vite error, checking if vite exists: ${viteExistsNow} at ${viteBinPath}`);
              
              if (viteExistsNow) {
                // Try npx vite build directly
                console.log(`[BUILD] vite exists, trying npx vite build directly...`);
                const npxCmd = execSync('which npx 2>/dev/null || command -v npx', { 
                  encoding: 'utf8',
                  shell: true,
                  env: { PATH: enhancedPath }
                }).trim() || 'npx';
                
                const npxProcess = spawn(npxCmd, ['vite', 'build'], {
                  cwd: projectPath,
                  stdio: 'pipe',
                  shell: true,
                  env: cleanEnv
                });
                
                let npxOutput = '';
                npxProcess.stdout.on('data', (data) => { npxOutput += data.toString(); });
                npxProcess.stderr.on('data', (data) => { npxOutput += data.toString(); });
                
                npxProcess.on('close', (npxCode) => {
                  if (npxCode === 0) {
                    console.log(`[BUILD] npx vite build succeeded!`);
                    resolve(npxOutput);
                  } else {
                    console.log(`[BUILD] npx vite build failed with code ${npxCode}`);
                    // Try next command in list
                    currentCmd++;
                    if (currentCmd < commands.length) {
                      console.log(`[BUILD] Trying next build command...`);
                      tryNext();
                    } else {
                      reject(new Error(`Build failed: Script command not found. ${output.substring(0, 500)}`));
                    }
                  }
                });
                
                npxProcess.on('error', (npxErr) => {
                  console.log(`[BUILD] npx vite build error: ${npxErr.message}`);
                  // Try next command in list
                  currentCmd++;
                  if (currentCmd < commands.length) {
                    console.log(`[BUILD] Trying next build command...`);
                    tryNext();
                  } else {
                    reject(new Error(`Build failed: Script command not found. ${output.substring(0, 500)}`));
                  }
                });
                
                return; // Don't continue, wait for npx result
              }
            }
            
            // Try next command (which might be npx vite build if vite exists)
            currentCmd++;
            if (currentCmd < commands.length) {
              console.log(`[BUILD] Trying next build command...`);
              tryNext();
            } else {
              reject(new Error(`Build failed: Script command not found. ${output.substring(0, 500)}`));
            }
            return;
          }
          
          // If command failed and it's not the last one, try next
          const buildErr = new Error(`Build failed (${cmd} exit code ${code}): ${output.trim().substring(0, 1200)}`);
          lastBuildError = buildErr;
          currentCmd++;
          if (currentCmd < commands.length) {
            console.log(`[BUILD] ${cmd} build failed (code ${code}), trying next package manager...`);
            console.log(`[BUILD] Error output: ${output.substring(0, 500)}`);
            tryNext();
          } else {
            reject(buildErr);
          }
        }
      });
      
      childProcess.on('error', (err) => {
        console.log(`[BUILD] Process error for ${fullCmd}: ${err.code} - ${err.message}`);
        if (err.code === 'ENOENT') {
          // Command not found, try next
          console.log(`[BUILD] ENOENT error - command not found at ${fullCmd}`);
          currentCmd++;
          tryNext();
        } else {
          // Other error, try next command if available
          currentCmd++;
          if (currentCmd < commands.length) {
            console.log(`[BUILD] ${cmd} build error: ${err.message}, trying next package manager...`);
            tryNext();
          } else {
            reject(err);
          }
        }
      });
    }
    
    tryNext();
  });
}

async function captureScreenshot(url, deploymentId, subdomain) {
  try {
    console.log(`[SCREENSHOT] Capturing screenshot for ${url}`);
    
    // First, verify the server is responding - try multiple paths
    const http = require('http');
    const urlsToTry = [
      url,                    // e.g., http://localhost:3001
      url + '/index.html',    // e.g., http://localhost:3001/index.html
    ];
    
    let workingUrl = url;
    let serverReady = false;
    
    for (const testUrl of urlsToTry) {
      try {
        await new Promise((resolve, reject) => {
          const checkReq = http.get(testUrl, (res) => {
            console.log(`[SCREENSHOT] Server check [${testUrl}] - Status: ${res.statusCode}`);
            if (res.statusCode === 200 || res.statusCode === 304) {
              workingUrl = testUrl;
              serverReady = true;
              resolve();
            } else {
              reject(new Error(`Status ${res.statusCode}`));
            }
          }).on('error', (err) => {
            reject(err);
          });
          
          setTimeout(() => {
            checkReq.destroy();
            reject(new Error('Timeout'));
          }, 5000);
        });
        break; // Found a working URL
      } catch (err) {
        console.log(`[SCREENSHOT] Server check [${testUrl}] failed: ${err.message}`);
      }
    }
    
    if (!serverReady) {
      console.log(`[SCREENSHOT] Warning: Server not responding with 200, trying anyway...`);
      workingUrl = url; // Use original URL anyway
    }
    
    console.log(`[SCREENSHOT] Using URL: ${workingUrl}`);
    
    // Dynamically import puppeteer (only when needed) - make it optional
    let puppeteer;
    try {
      puppeteer = require('puppeteer');
    } catch (err) {
      console.error(`[SCREENSHOT] Puppeteer not available: ${err.message}`);
      console.error(`[SCREENSHOT] Skipping screenshot capture. Install puppeteer to enable screenshots.`);
      return null;
    }
    
    // Try to find system Chromium
    const execSync = require('child_process').execSync;
    let executablePath;
    try {
      // Try common Chromium paths
      const chromiumPaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
      ];
      
      for (const chromePath of chromiumPaths) {
        if (fsNative.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log(`[SCREENSHOT] Using system Chromium at: ${executablePath}`);
          break;
        }
      }
    } catch (err) {
      console.log('[SCREENSHOT] System Chromium not found, using Puppeteer default');
    }
    
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--force-device-scale-factor=1',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-webgl',
        '--disable-accelerated-2d-canvas'
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1280,
        height: 800,
        deviceScaleFactor: 1
      }
    };
    
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    
    const browser = await puppeteer.launch(launchOptions);
    
    const page = await browser.newPage();
    
    // Track failed resources
    const failedResources = [];
    
    // Log console messages from the page
    page.on('console', msg => console.log(`[SCREENSHOT PAGE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', error => console.log(`[SCREENSHOT ERROR] ${error.message}`));
    page.on('requestfailed', request => {
      const failure = `${request.url()} - ${request.failure().errorText}`;
      failedResources.push(failure);
      console.log(`[SCREENSHOT] Failed resource: ${failure}`);
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        const failure = `${response.url()} - Status: ${response.status()}`;
        failedResources.push(failure);
        console.log(`[SCREENSHOT] Failed resource: ${failure}`);
      }
    });
    
    // Set viewport for consistent screenshots
    await page.setViewport({ width: 1280, height: 800 });
    
    // Emulate real browser environment
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to the URL with timeout - wait for everything to load
    try {
      await page.goto(workingUrl, { 
        waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
        timeout: 30000 
      });
    } catch (err) {
      console.log(`[SCREENSHOT] Navigation warning: ${err.message}`);
      // Continue anyway - page might have partially loaded
    }
    
    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');
    
    // Wait for images to load
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images)
          .filter(img => !img.complete)
          .map(img => new Promise(resolve => {
            img.onload = img.onerror = resolve;
          }))
      );
    });
    
    // Additional wait for animations and dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Force white background and ensure paint before screenshot (fixes black screen on Linux)
    await page.evaluate(() => {
      document.body.style.backgroundColor = 'white';
      document.documentElement.style.backgroundColor = 'white';
      window.scrollTo(0, 0);
      document.body.offsetHeight;
    });
    
    // Wait for compositor to paint (fixes black screenshots)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Check if page has content
    const pageInfo = await page.evaluate(() => {
      const body = document.body;
      const hasContent = body && (body.textContent.trim().length > 0 || body.children.length > 0);
      return {
        hasContent,
        title: document.title,
        bodyHTML: body ? body.innerHTML.substring(0, 500) : '',
        childrenCount: body ? body.children.length : 0,
        textLength: body ? body.textContent.trim().length : 0,
        backgroundColor: window.getComputedStyle(document.body).backgroundColor
      };
    });
    
    console.log(`[SCREENSHOT] Page info:`, JSON.stringify(pageInfo, null, 2));
    
    if (failedResources.length > 0) {
      console.log(`[SCREENSHOT] ${failedResources.length} resources failed to load`);
    }
    
    if (!pageInfo.hasContent) {
      console.log('[SCREENSHOT] Warning: Page appears to be empty');
    }
    
    // Check if stylesheets loaded
    const stylesheetsLoaded = await page.evaluate(() => {
      return document.styleSheets.length;
    });
    console.log(`[SCREENSHOT] Stylesheets loaded: ${stylesheetsLoaded}`);
    
    // Take screenshot with specific settings
    const screenshotFileName = `${deploymentId}.png`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFileName);
    
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: false,
      type: 'png',
      omitBackground: false,
      captureBeyondViewport: false
    });
    
    console.log('[SCREENSHOT] Screenshot captured');
    
    // Log screenshot file size to verify it's not empty
    const stats = await fs.stat(screenshotPath);
    console.log(`[SCREENSHOT] File size: ${Math.round(stats.size / 1024)}KB`);
    
    await browser.close();
    
    console.log(`[SCREENSHOT] Screenshot saved to ${screenshotPath}`);
    
    // Return relative path for serving via Next.js
    return `/screenshots/${screenshotFileName}`;
  } catch (error) {
    console.error(`[SCREENSHOT] Failed to capture screenshot: ${error.message}`);
    console.error(`[SCREENSHOT] Stack trace:`, error.stack);
    // Don't fail the deployment if screenshot fails
    return null;
  }
}

function startPreviewServer(projectPath, port, framework = 'vite') {
  return new Promise(async (resolve, reject) => {
    console.log(`[PREVIEW] Starting ${framework} preview server from: ${projectPath}`);
    console.log(`[PREVIEW] Framework parameter received: ${framework}`);
    
    // Safety check: verify framework matches project structure
    const nextPath = path.join(projectPath, '.next');
    const distPath = path.join(projectPath, 'dist');
    const hasNext = await fs.pathExists(nextPath);
    const hasDist = await fs.pathExists(distPath);
    
    if (hasNext && framework !== 'nextjs') {
      console.log(`[PREVIEW] ⚠ WARNING: Found .next folder but framework is ${framework}, forcing to nextjs`);
      framework = 'nextjs';
    }
    
    if (hasDist && !hasNext && framework === 'nextjs') {
      console.log(`[PREVIEW] ⚠ WARNING: Found dist folder but no .next folder, framework is ${framework}, changing to vite`);
      framework = 'vite';
    }
    
    let commands = [];
    
    if (framework === 'nextjs') {
      console.log(`[PREVIEW] ===== NEXT.JS PREVIEW DETECTION v2.0 =====`);
      
      // Check for static export (output: export) - creates 'out' folder
      const outPath = path.join(projectPath, 'out');
      const outExists = await fs.pathExists(outPath);
      
      // Check for .next folder (server-side rendering)
      const nextPath = path.join(projectPath, '.next');
      const nextExists = await fs.pathExists(nextPath);
      
      console.log(`[PREVIEW] .next folder exists: ${nextExists} at ${nextPath}`);
      console.log(`[PREVIEW] out folder exists: ${outExists} at ${outPath}`);
      
      // Check next.config for output: export
      let isStaticExport = false;
      const configPaths = [
        path.join(projectPath, 'next.config.js'),
        path.join(projectPath, 'next.config.mjs'),
        path.join(projectPath, 'next.config.ts')
      ];
      
      console.log(`[PREVIEW] Checking config files for static export...`);
      for (const configPath of configPaths) {
        const configExists = await fs.pathExists(configPath);
        console.log(`[PREVIEW] Config ${path.basename(configPath)} exists: ${configExists}`);
        
        if (configExists) {
          try {
            const configContent = await fs.readFile(configPath, 'utf8');
            console.log(`[PREVIEW] Config ${path.basename(configPath)} content length: ${configContent.length}`);
            console.log(`[PREVIEW] Config ${path.basename(configPath)} content preview: ${configContent.substring(0, 200)}`);
            
            // Check for output: 'export' or output: "export" - MUST be specific to avoid false positives
            // Only match patterns that are clearly "output:" followed by export value
            // Do NOT match just "export" (which would match "export default")
            const regexPatterns = [
              /output\s*:\s*['"]export['"]/,           // output: 'export' or output: "export"
              /output\s*:\s*export\b/,                  // output: export (word boundary to avoid matching "exported")
            ];
            
            // Check regex patterns - these are more precise
            for (const regex of regexPatterns) {
              if (regex.test(configContent)) {
                isStaticExport = true;
                const match = configContent.match(regex);
                console.log(`[PREVIEW] ✓ Detected static export via regex ${regex} in ${path.basename(configPath)}`);
                console.log(`[PREVIEW] Matched text: "${match ? match[0] : 'N/A'}"`);
                break;
              }
            }
            
            // If no match found, log for debugging
            if (!isStaticExport) {
              console.log(`[PREVIEW] No static export pattern found in ${path.basename(configPath)}`);
            }
            
            if (isStaticExport) break;
          } catch (err) {
            console.log(`[PREVIEW] Error reading config ${path.basename(configPath)}: ${err.message}`);
          }
        }
      }
      
      console.log(`[PREVIEW] Static export detection result: ${isStaticExport}`);
      
      // If out folder exists or static export detected, serve as static files
      if (outExists || isStaticExport) {
        console.log(`[PREVIEW] Next.js static export detected, serving 'out' folder`);
        if (!outExists) {
          return reject(new Error('Next.js static export configured but "out" folder not found. Please build the project first.'));
        }
        
        // Serve static export with serve or similar
        commands = [
          { cmd: 'npx', args: ['-y', 'serve', '-s', 'out', '-l', port.toString()], description: 'npx serve out (static export)' },
          { cmd: 'npx', args: ['-y', 'http-server', 'out', '-p', port.toString()], description: 'npx http-server out (static export)' }
        ];
      } else if (nextExists) {
        // Standard Next.js server-side rendering
        console.log(`[PREVIEW] Next.js SSR detected, using next start`);
        // Next.js uses -p flag for port
        commands = [
          { cmd: 'npm', args: ['run', 'start', '--', '-p', port.toString()], description: 'npm run start' },
          { cmd: 'npx', args: ['next', 'start', '-p', port.toString()], description: 'npx next start' },
          { cmd: 'pnpm', args: ['run', 'start', '--', '-p', port.toString()], description: 'pnpm run start' },
          { cmd: 'yarn', args: ['run', 'start', '-p', port.toString()], description: 'yarn run start' }
        ];
      } else {
        return reject(new Error('Next.js build output (.next or out folder) not found. Please build the project first.'));
      }
    } else {
      // Vite preview commands (default)
      // Check if dist folder exists
      const distPath = path.join(projectPath, 'dist');
      const distExists = await fs.pathExists(distPath);
      
      console.log(`[PREVIEW] Dist folder exists: ${distExists} at ${distPath}`);
      
      if (distExists) {
        const distContents = await fs.readdir(distPath).catch(() => []);
        console.log(`[PREVIEW] Dist folder contains ${distContents.length} items: ${distContents.slice(0, 5).join(', ')}`);
      }
      
      // Try vite preview first, then npm run preview
      // If dist exists, vite preview should find it automatically
      commands = [
        { cmd: 'npx', args: ['vite', 'preview', '--port', port.toString(), '--host'], description: 'npx vite preview' },
        { cmd: 'npm', args: ['run', 'preview', '--', '--port', port.toString()], description: 'npm run preview' },
        { cmd: 'pnpm', args: ['run', 'preview', '--', '--port', port.toString()], description: 'pnpm run preview' }
      ];
      
      // If dist exists but vite preview fails, try serving dist directly with serve
      if (distExists) {
        commands.push({ 
          cmd: 'npx', 
          args: ['-y', 'serve', '-s', 'dist', '-l', port.toString()], 
          description: 'npx serve dist (fallback)' 
        });
      }
    }
    
    let currentCmd = 0;
    let lastError = null;
    
    function tryNext() {
      if (currentCmd >= commands.length) {
        const errorMsg = lastError 
          ? `Could not start preview server: ${lastError.message || 'All attempts failed'}`
          : 'Could not start preview server: All attempts failed';
        console.error(`[PREVIEW] ${errorMsg}`);
        return reject(new Error(errorMsg));
      }
      
      const { cmd, args, description } = commands[currentCmd];
      console.log(`[PREVIEW] Attempt ${currentCmd + 1}/${commands.length}: ${description}`);
      console.log(`[PREVIEW] Command: ${cmd} ${args.join(' ')}`);
      
      // Set up environment variables
      const env = { 
        ...process.env, 
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' 
      };
      
      // For Next.js, set PORT and NODE_ENV
      if (framework === 'nextjs') {
        env.PORT = port.toString();
        env.NODE_ENV = 'production';
      }
      
      const childProcess = spawn(cmd, args, {
        cwd: projectPath,
        stdio: 'pipe',
        shell: true,
        detached: true,
        env
      });
      
      let output = '';
      let started = false;
      
      childProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[PREVIEW STDOUT] ${text.substring(0, 300)}`);
        
        // Different success indicators for Next.js vs Vite
        const isNextJs = framework === 'nextjs';
        const successIndicators = isNextJs
          ? ['Ready on', 'started server on', 'localhost:', 'http://', 'Local:', 'ready']
          : ['Local:', 'localhost:', 'ready', 'Serving!', 'http://'];
        
        const hasSuccessIndicator = successIndicators.some(indicator => text.includes(indicator));
        const hasFailureIndicator = output.includes('EADDRINUSE') || output.includes('Failed to start server') || output.includes('address already in use');
        
        if (!started && hasSuccessIndicator && !hasFailureIndicator) {
          started = true;
          
          // Parse actual port from output
          let actualPort = port;
          // Try multiple port patterns
          const portPatterns = [
            /localhost:(\d+)/,
            /:\/(\d+)/,
            /port (\d+)/,
            /on (\d+)/,
            /0\.0\.0\.0:(\d+)/,
            /http:\/\/[^:]+:(\d+)/
          ];
          
          for (const pattern of portPatterns) {
            const portMatch = output.match(pattern);
            if (portMatch) {
              actualPort = parseInt(portMatch[1], 10);
              if (actualPort !== port) {
                console.log(`[PREVIEW] Port changed from ${port} to ${actualPort} (requested port was in use)`);
              }
              break;
            }
          }
          
          console.log(`[PREVIEW] ✓ Server started successfully with ${description} on port ${actualPort}`);
          resolve({ process: childProcess, output, pid: childProcess.pid, port: actualPort });
        }
      });
      
      childProcess.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[PREVIEW STDERR] ${text.substring(0, 300)}`);
        
        // Different success indicators for Next.js vs Vite
        const isNextJs = framework === 'nextjs';
        const successIndicators = isNextJs
          ? ['Ready on', 'started server on', 'localhost:', 'http://', 'Local:', 'ready']
          : ['Local:', 'localhost:', 'ready', 'Serving!', 'http://'];
        
        const hasSuccessIndicator = successIndicators.some(indicator => text.includes(indicator));
        const hasFailureIndicator = output.includes('EADDRINUSE') || output.includes('Failed to start server') || output.includes('address already in use');
        
        if (!started && hasSuccessIndicator && !hasFailureIndicator) {
          started = true;
          
          // Parse actual port from output
          let actualPort = port;
          // Try multiple port patterns
          const portPatterns = [
            /localhost:(\d+)/,
            /:\/(\d+)/,
            /port (\d+)/,
            /on (\d+)/,
            /0\.0\.0\.0:(\d+)/,
            /http:\/\/[^:]+:(\d+)/
          ];
          
          for (const pattern of portPatterns) {
            const portMatch = output.match(pattern);
            if (portMatch) {
              actualPort = parseInt(portMatch[1], 10);
              if (actualPort !== port) {
                console.log(`[PREVIEW] Port changed from ${port} to ${actualPort} (requested port was in use)`);
              }
              break;
            }
          }
          
          console.log(`[PREVIEW] ✓ Server started successfully with ${description} on port ${actualPort}`);
          resolve({ process: childProcess, output, pid: childProcess.pid, port: actualPort });
        }
      });
      
      childProcess.on('error', (err) => {
        console.error(`[PREVIEW] Process error for ${description}: ${err.message}`);
        lastError = err;
        if (err.code === 'ENOENT') {
          currentCmd++;
          setTimeout(tryNext, 1000);
        } else {
          currentCmd++;
          if (currentCmd < commands.length) {
            setTimeout(tryNext, 1000);
          } else {
            reject(err);
          }
        }
      });
      
      childProcess.on('exit', (code) => {
        if (!started && code !== 0 && code !== null) {
          console.error(`[PREVIEW] Process exited with code ${code} for ${description}`);
          console.error(`[PREVIEW] Output: ${output.substring(0, 500)}`);
          
          // Check if this is a static export error for Next.js
          const isStaticExportError = framework === 'nextjs' && 
            (output.includes('output: export') || 
             output.includes('does not work with "output: export"') ||
             output.includes('Use "npx serve@latest out"'));
          
          if (isStaticExportError) {
            console.log(`[PREVIEW] ⚠ Detected static export error, switching to static file serving`);
            // Check for out folder
            const outPath = path.join(projectPath, 'out');
            fs.pathExists(outPath).then(outExists => {
              if (outExists) {
                console.log(`[PREVIEW] Found 'out' folder, switching to static serving`);
                // Replace remaining commands with static serving commands
                commands = commands.slice(currentCmd); // Remove failed commands
                commands.unshift(
                  { cmd: 'npx', args: ['-y', 'serve', '-s', 'out', '-l', port.toString()], description: 'npx serve out (static export fallback)' },
                  { cmd: 'npx', args: ['-y', 'http-server', 'out', '-p', port.toString()], description: 'npx http-server out (static export fallback)' }
                );
                currentCmd = 0; // Reset to start with static serving
                setTimeout(tryNext, 1000);
              } else {
                lastError = new Error(`Static export configured but "out" folder not found`);
                currentCmd++;
                if (currentCmd < commands.length) {
                  setTimeout(tryNext, 2000);
                }
              }
            }).catch(() => {
              lastError = new Error(`Process exited with code ${code}: ${output.substring(0, 200)}`);
              currentCmd++;
              if (currentCmd < commands.length) {
                setTimeout(tryNext, 2000);
              }
            });
            return;
          }
          
          lastError = new Error(`Process exited with code ${code}: ${output.substring(0, 200)}`);
          currentCmd++;
          if (currentCmd < commands.length) {
            setTimeout(tryNext, 2000);
          }
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!started) {
          console.log(`[PREVIEW] Timeout waiting for ${description}, trying next...`);
          try {
            childProcess.kill();
          } catch (e) {}
          currentCmd++;
          if (currentCmd < commands.length) {
            tryNext();
          } else {
            reject(new Error(`Preview server start timeout - all attempts failed. Last output: ${output.substring(0, 500)}`));
          }
        }
      }, 30000);
    }
    
    tryNext();
  });
}

async function deployProject(filePath, siteName, options = {}) {
  const { isDemo = false } = options;
  // Version marker to verify new code is loaded
  console.log(`[DEPLOY] ===== DEPLOYMENT MANAGER v2.0 - Next.js Support Enabled =====`);
  
  const deploymentId = require('uuid').v4();
  const subdomain = generateSubdomain(siteName);
  const port = await getNextAvailablePort();
  const deploymentDir = path.join(DEPLOYMENTS_DIR, deploymentId);
  
  // Calculate expiration time for demo projects (30 minutes from now)
  const expiresAt = isDemo ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null;
  
  try {
    // Insert deployment record
    const insertStmt = db.prepare(`
      INSERT INTO deployments (id, site_name, subdomain, status, port, file_path, is_demo, expires_at)
      VALUES (?, ?, ?, 'processing', ?, ?, ?, ?)
    `);
    insertStmt.run(deploymentId, siteName, subdomain, port, filePath, isDemo ? 1 : 0, expiresAt);
    
    // Create deployment directory
    await fs.ensureDir(deploymentDir);
    
    // Unzip file with security checks for demo projects
    await unzipFile(filePath, deploymentDir, {
      maxExtractedSize: 50 * 1024 * 1024, // 50MB limit
      checkZipBomb: isDemo // Check for zip bombs on demo uploads
    });
    
    // Find project root
    const projectInfo = await findProjectRoot(deploymentDir);
    let framework = projectInfo.framework;
    
    console.log(`[DEPLOY] Initial detection - framework: ${framework}, project type: ${projectInfo.type}, path: ${projectInfo.path}`);
    
    // If framework is unknown or missing, try to detect it again or default based on project type
    if (!framework || framework === 'unknown') {
      console.log(`[DEPLOY] Framework is ${framework || 'undefined'}, attempting re-detection...`);
      
      if (projectInfo.type === 'nextjs-built') {
        framework = 'nextjs';
        console.log(`[DEPLOY] Set framework to nextjs based on nextjs-built type`);
      } else if (projectInfo.type === 'dist') {
        framework = 'vite';
        console.log(`[DEPLOY] Set framework to vite based on dist type`);
      } else {
        // Try detecting again from the project path
        console.log(`[DEPLOY] Re-detecting framework from project path: ${projectInfo.path}`);
        framework = await detectProjectType(projectInfo.path);
        console.log(`[DEPLOY] Re-detection result: ${framework}`);
        
        // Additional fallback: check project name and path for hints
        if (!framework || framework === 'unknown') {
          const projectPathLower = projectInfo.path.toLowerCase();
          const siteNameLower = siteName.toLowerCase();
          
          if (projectPathLower.includes('next') || siteNameLower.includes('next')) {
            console.log(`[DEPLOY] Detected 'next' in path/name, setting framework to nextjs`);
            framework = 'nextjs';
          } else {
            console.log(`[DEPLOY] ⚠ Could not detect framework, defaulting to vite`);
            framework = 'vite';
          }
        }
      }
    }
    
    // Final validation: if we have a .next folder, it MUST be Next.js
    const nextPath = path.join(projectInfo.path, '.next');
    const hasNextFolder = await fs.pathExists(nextPath);
    if (hasNextFolder && framework !== 'nextjs') {
      console.log(`[DEPLOY] ⚠ Found .next folder but framework is ${framework}, forcing to nextjs`);
      framework = 'nextjs';
    }
    
    // Additional check: if project path or name contains "next", prioritize Next.js
    const pathLower = projectInfo.path.toLowerCase();
    const nameLower = siteName.toLowerCase();
    if ((pathLower.includes('next') || nameLower.includes('next')) && framework === 'vite') {
      // Double-check by looking for next in package.json
      const packageJsonPath = path.join(projectInfo.path, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        try {
          const packageJson = await fs.readJson(packageJsonPath);
          const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
          if (deps.next) {
            console.log(`[DEPLOY] ⚠ Project name/path contains 'next' and next dependency found, forcing to nextjs`);
            framework = 'nextjs';
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }
    
    console.log(`[DEPLOY] Final detected framework: ${framework}, project type: ${projectInfo.type}`);
    
    let buildLog = '';
    let projectPath = projectInfo.path;
    
    if (projectInfo.type === 'project' || projectInfo.type === 'nextjs-built') {
      // For projects that need building, install dependencies first
      if (projectInfo.type === 'project') {
        // Install dependencies
        try {
          buildLog += 'Installing dependencies...\n';
          const installOutput = await installDependencies(projectPath);
          buildLog += installOutput + '\n';
        } catch (err) {
          throw new Error(`Dependency installation failed: ${err.message}`);
        }
        
        // Build project
        try {
          buildLog += `Building ${framework} project...\n`;
          const buildOutput = await buildProject(projectPath, framework);
          buildLog += buildOutput + '\n';
          
          // After build, check if Next.js created an 'out' folder (static export)
          if (framework === 'nextjs') {
            const outPath = path.join(projectPath, 'out');
            const outExists = await fs.pathExists(outPath);
            if (outExists) {
              console.log(`[DEPLOY] ✓ Detected 'out' folder after build - this is a static export Next.js app`);
              // Note: We'll handle this in startPreviewServer, but log it here for visibility
            }
          }
        } catch (err) {
          throw new Error(`Build failed: ${err.message}`);
        }
      }
      
      // For Next.js, projectPath stays as the project root (not dist)
      // For Vite, update projectPath to dist folder
      if (framework === 'vite') {
        const distPath = path.join(projectPath, 'dist');
        if (await fs.pathExists(distPath)) {
          projectPath = distPath;
        }
      }
      // For Next.js, keep projectPath as the project root (needed for next start or out folder)
    }
    
    // Start preview server
    buildLog += `Starting ${framework} preview server on port ${port}...\n`;
    const { process: previewProcess, pid, port: actualPort } = await startPreviewServer(
      projectInfo.type === 'project' || projectInfo.type === 'nextjs-built' 
        ? projectInfo.path 
        : path.dirname(projectPath),
      port,
      framework
    );
    
    // Use actual port (vite preview may use a different port if requested port is in use)
    const serverPort = actualPort || port;
    if (serverPort !== port) {
      console.log(`[DEPLOY] Preview server using port ${serverPort} instead of requested ${port}`);
      buildLog += `Server started on port ${serverPort} (requested ${port} was in use)\n`;
    }
    
    // Update deployment status with PID and actual port
    const updateStmt = db.prepare(`
      UPDATE deployments 
      SET status = 'running', build_log = ?, pid = ?, port = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(buildLog, pid || previewProcess.pid, serverPort, deploymentId);
    
    // Note: Port management is handled by getNextPort() which queries the database
    // No need to manually track ports since we update the database with the actual port
    
    // Detach process so it runs independently
    previewProcess.unref();
    
    // Use subdomain URL instead of localhost
    const deploymentUrl = process.env.DEPLOYMENT_DOMAIN 
      ? `https://${subdomain}.${process.env.DEPLOYMENT_DOMAIN}`
      : `http://localhost:${serverPort}`;
    
    // Capture screenshot (async, don't wait for it)
    // Use localhost URL for screenshot to avoid SSL/proxy issues
    setTimeout(async () => {
      const screenshotUrl = `http://localhost:${serverPort}`;
      console.log(`[SCREENSHOT] Using URL: ${screenshotUrl} (public URL: ${deploymentUrl})`);
      const screenshotPath = await captureScreenshot(screenshotUrl, deploymentId, subdomain);
      if (screenshotPath) {
        const screenshotStmt = db.prepare(`
          UPDATE deployments 
          SET screenshot_path = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);
        screenshotStmt.run(screenshotPath, deploymentId);
        console.log(`[SCREENSHOT] Updated database with screenshot path for ${deploymentId}`);
      }
    }, 10000); // Wait 10 seconds for server to be fully ready
    
    return {
      id: deploymentId,
      siteName,
      subdomain,
      port: serverPort,
      status: 'running',
      url: deploymentUrl
    };
  } catch (error) {
    // Update deployment with error
    const errorStmt = db.prepare(`
      UPDATE deployments 
      SET status = 'failed', error_log = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    errorStmt.run(error.message, deploymentId);
    
    // Cleanup
    await fs.remove(deploymentDir).catch(() => {});
    
    throw error;
  }
}

async function removeDeployment(deploymentId) {
  const stmt = db.prepare('SELECT * FROM deployments WHERE id = ?');
  const deployment = stmt.get(deploymentId);
  
  if (!deployment) {
    throw new Error('Deployment not found');
  }
  
  // Kill the preview server process
  try {
    if (deployment.pid) {
      // Try to kill by PID first
      try {
        process.kill(deployment.pid, 'SIGTERM');
        // Wait a bit, then force kill if still running
        setTimeout(() => {
          try {
            process.kill(deployment.pid, 'SIGKILL');
          } catch (e) {
            // Process already dead
          }
        }, 2000);
      } catch (err) {
        // PID might be invalid, try port-based kill
        if (deployment.port) {
          execSync(`lsof -ti:${deployment.port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
        }
      }
    } else if (deployment.port) {
      // Fallback: kill by port
      execSync(`lsof -ti:${deployment.port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    }
  } catch (err) {
    // Process might already be dead, continue with cleanup
  }
  
  // Remove screenshot if exists
  if (deployment.screenshot_path) {
    const screenshotPath = path.join(process.cwd(), 'public', deployment.screenshot_path);
    await fs.remove(screenshotPath).catch(() => {});
  }
  
  // Remove uploaded zip file if exists
  if (deployment.file_path) {
    try {
      const fileExists = fsNative.existsSync(deployment.file_path);
      if (fileExists) {
        await fs.remove(deployment.file_path);
        console.log(`[REMOVE] Deleted uploaded zip file: ${deployment.file_path}`);
      }
    } catch (err) {
      console.warn(`[REMOVE] Failed to delete uploaded zip file: ${err.message}`);
      // Don't throw - continue with cleanup even if file deletion fails
    }
  }
  
  // Remove deployment directory
  const deploymentDir = path.join(DEPLOYMENTS_DIR, deploymentId);
  await fs.remove(deploymentDir).catch(() => {});
  
  // Remove from database
  const deleteStmt = db.prepare('DELETE FROM deployments WHERE id = ?');
  deleteStmt.run(deploymentId);
  
  return true;
}

function getAllDeployments() {
  const stmt = db.prepare('SELECT * FROM deployments ORDER BY created_at DESC');
  return stmt.all();
}

function getDeployment(id) {
  const stmt = db.prepare('SELECT * FROM deployments WHERE id = ?');
  return stmt.get(id);
}

function isDemoDeployment(id) {
  const stmt = db.prepare('SELECT is_demo FROM deployments WHERE id = ?');
  const result = stmt.get(id);
  return result ? result.is_demo === 1 : false;
}

async function cleanupExpiredDemoDeployments() {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    SELECT id FROM deployments 
    WHERE is_demo = 1 AND expires_at IS NOT NULL AND expires_at < ?
  `);
  const expired = stmt.all(now);
  
  console.log(`[CLEANUP] Found ${expired.length} expired demo deployments`);
  
  const removalPromises = expired.map(async (deployment) => {
    try {
      await removeDeployment(deployment.id);
      console.log(`[CLEANUP] Removed expired demo deployment: ${deployment.id}`);
      return true;
    } catch (error) {
      console.error(`[CLEANUP] Failed to remove deployment ${deployment.id}:`, error.message);
      return false;
    }
  });
  
  await Promise.all(removalPromises);
  
  // Also clean up orphaned files in uploads folder
  const orphanedCount = await cleanupOrphanedUploadFiles();
  
  return expired.length;
}

async function cleanupOrphanedUploadFiles() {
  try {
    // Get all file_paths from active deployments
    const stmt = db.prepare('SELECT file_path FROM deployments WHERE file_path IS NOT NULL');
    const deployments = stmt.all();
    const activeFilePaths = new Set(deployments.map(d => d.file_path).filter(Boolean));
    
    // Read all files in uploads directory
    const uploadFiles = await fs.readdir(UPLOADS_DIR).catch(() => []);
    
    let deletedCount = 0;
    const deletionPromises = uploadFiles.map(async (fileName) => {
      const filePath = path.join(UPLOADS_DIR, fileName);
      
      // Check if file is referenced by any deployment
      const isReferenced = Array.from(activeFilePaths).some(activePath => {
        // Normalize paths for comparison
        const normalizedActive = path.resolve(activePath);
        const normalizedFile = path.resolve(filePath);
        return normalizedActive === normalizedFile;
      });
      
      if (!isReferenced) {
        try {
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            await fs.remove(filePath);
            console.log(`[CLEANUP] Deleted orphaned upload file: ${fileName}`);
            deletedCount++;
          }
        } catch (err) {
          console.warn(`[CLEANUP] Failed to delete orphaned file ${fileName}:`, err.message);
        }
      }
    });
    
    await Promise.all(deletionPromises);
    
    if (deletedCount > 0) {
      console.log(`[CLEANUP] Cleaned up ${deletedCount} orphaned upload file(s)`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error(`[CLEANUP] Error cleaning orphaned files:`, error.message);
    return 0;
  }
}

module.exports = {
  deployProject,
  removeDeployment,
  getAllDeployments,
  getDeployment,
  isDemoDeployment,
  cleanupExpiredDemoDeployments,
  cleanupOrphanedUploadFiles,
  DEPLOYMENTS_DIR,
  UPLOADS_DIR
};
