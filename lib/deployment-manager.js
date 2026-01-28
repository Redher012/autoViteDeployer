const fs = require('fs-extra');
const path = require('path');
const { execSync, spawn } = require('child_process');
const yauzl = require('yauzl');
const { promisify } = require('util');
const db = require('./db');

const DEPLOYMENTS_DIR = path.join(process.cwd(), 'deployments');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure directories exist
fs.ensureDirSync(DEPLOYMENTS_DIR);
fs.ensureDirSync(UPLOADS_DIR);

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

async function unzipFile(zipPath, extractTo) {
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
        
        if (/\/$/.test(entry.fileName)) {
          // Directory entry - ensure directory exists
          const dirPath = path.join(extractTo, entry.fileName);
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
            
            const filePath = path.join(extractTo, entry.fileName);
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

async function findProjectRoot(dir) {
  // Check if dist folder exists (pre-built)
  const distPath = path.join(dir, 'dist');
  if (await fs.pathExists(distPath)) {
    return { type: 'dist', path: distPath };
  }
  
  // Check if package.json exists (full project)
  const packageJsonPath = path.join(dir, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    return { type: 'project', path: dir };
  }
  
  // Check subdirectories
  const entries = await fs.readdir(dir);
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    const stat = await fs.stat(entryPath);
    
    if (stat.isDirectory()) {
      const distPath = path.join(entryPath, 'dist');
      const packageJsonPath = path.join(entryPath, 'package.json');
      
      if (await fs.pathExists(distPath)) {
        return { type: 'dist', path: distPath };
      }
      
      if (await fs.pathExists(packageJsonPath)) {
        return { type: 'project', path: entryPath };
      }
    }
  }
  
  throw new Error('Could not find dist folder or package.json in uploaded archive');
}

async function installDependencies(projectPath) {
  return new Promise((resolve, reject) => {
    // Try npm first, then pnpm
    const commands = [
      { cmd: 'npm', args: ['install'] },
      { cmd: 'pnpm', args: ['install'] }
    ];
    
    let currentCmd = 0;
    
    function tryNext() {
      if (currentCmd >= commands.length) {
        return reject(new Error('Neither npm nor pnpm found'));
      }
      
      const { cmd, args } = commands[currentCmd];
      const process = spawn(cmd, args, {
        cwd: projectPath,
        stdio: 'pipe',
        shell: true
      });
      
      let output = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          currentCmd++;
          if (currentCmd < commands.length) {
            tryNext();
          } else {
            reject(new Error(`Installation failed: ${output}`));
          }
        }
      });
      
      process.on('error', (err) => {
        if (err.code === 'ENOENT') {
          currentCmd++;
          tryNext();
        } else {
          reject(err);
        }
      });
    }
    
    tryNext();
  });
}

async function buildProject(projectPath) {
  return new Promise((resolve, reject) => {
    const commands = [
      { cmd: 'npm', args: ['run', 'build'] },
      { cmd: 'pnpm', args: ['run', 'build'] }
    ];
    
    let currentCmd = 0;
    
    function tryNext() {
      if (currentCmd >= commands.length) {
        return reject(new Error('Build command failed - neither npm nor pnpm worked'));
      }
      
      const { cmd, args } = commands[currentCmd];
      const process = spawn(cmd, args, {
        cwd: projectPath,
        stdio: 'pipe',
        shell: true
      });
      
      let output = '';
      
      process.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          currentCmd++;
          if (currentCmd < commands.length) {
            tryNext();
          } else {
            reject(new Error(`Build failed: ${output}`));
          }
        }
      });
      
      process.on('error', (err) => {
        if (err.code === 'ENOENT') {
          currentCmd++;
          tryNext();
        } else {
          reject(err);
        }
      });
    }
    
    tryNext();
  });
}

function startPreviewServer(projectPath, port) {
  return new Promise((resolve, reject) => {
    // Try vite preview first, then npm run preview
    const commands = [
      { cmd: 'npx', args: ['vite', 'preview', '--port', port.toString(), '--host'] },
      { cmd: 'npm', args: ['run', 'preview', '--', '--port', port.toString()] },
      { cmd: 'pnpm', args: ['run', 'preview', '--', '--port', port.toString()] }
    ];
    
    let currentCmd = 0;
    
    function tryNext() {
      if (currentCmd >= commands.length) {
        return reject(new Error('Could not start preview server'));
      }
      
      const { cmd, args } = commands[currentCmd];
      const process = spawn(cmd, args, {
        cwd: projectPath,
        stdio: 'pipe',
        shell: true,
        detached: true
      });
      
      let output = '';
      let started = false;
      
      process.stdout.on('data', (data) => {
        output += data.toString();
        if (!started && (output.includes('Local:') || output.includes('localhost') || output.includes('ready'))) {
          started = true;
          resolve({ process, output, pid: process.pid });
        }
      });
      
      process.stderr.on('data', (data) => {
        output += data.toString();
        if (!started && (output.includes('Local:') || output.includes('localhost') || output.includes('ready'))) {
          started = true;
          resolve({ process, output, pid: process.pid });
        }
      });
      
      process.on('error', (err) => {
        if (err.code === 'ENOENT') {
          currentCmd++;
          setTimeout(tryNext, 1000);
        } else {
          reject(err);
        }
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!started) {
          currentCmd++;
          if (currentCmd < commands.length) {
            tryNext();
          } else {
            reject(new Error('Preview server start timeout'));
          }
        }
      }, 30000);
    }
    
    tryNext();
  });
}

async function deployProject(filePath, siteName) {
  const deploymentId = require('uuid').v4();
  const subdomain = generateSubdomain(siteName);
  const port = getNextPort();
  const deploymentDir = path.join(DEPLOYMENTS_DIR, deploymentId);
  
  try {
    // Insert deployment record
    const insertStmt = db.prepare(`
      INSERT INTO deployments (id, site_name, subdomain, status, port, file_path)
      VALUES (?, ?, ?, 'processing', ?, ?)
    `);
    insertStmt.run(deploymentId, siteName, subdomain, port, filePath);
    
    // Create deployment directory
    await fs.ensureDir(deploymentDir);
    
    // Unzip file
    await unzipFile(filePath, deploymentDir);
    
    // Find project root
    const projectInfo = await findProjectRoot(deploymentDir);
    
    let buildLog = '';
    let projectPath = projectInfo.path;
    
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
        buildLog += 'Building project...\n';
        const buildOutput = await buildProject(projectPath);
        buildLog += buildOutput + '\n';
      } catch (err) {
        throw new Error(`Build failed: ${err.message}`);
      }
      
      // Update projectPath to dist folder
      const distPath = path.join(projectPath, 'dist');
      if (await fs.pathExists(distPath)) {
        projectPath = distPath;
      }
    }
    
    // Start preview server
    buildLog += `Starting preview server on port ${port}...\n`;
    const { process: previewProcess, pid } = await startPreviewServer(
      projectInfo.type === 'project' ? projectInfo.path : path.dirname(projectPath),
      port
    );
    
    // Update deployment status with PID
    const updateStmt = db.prepare(`
      UPDATE deployments 
      SET status = 'running', build_log = ?, pid = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(buildLog, pid || previewProcess.pid, deploymentId);
    
    // Detach process so it runs independently
    previewProcess.unref();
    
    return {
      id: deploymentId,
      siteName,
      subdomain,
      port,
      status: 'running',
      url: `http://localhost:${port}`
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

module.exports = {
  deployProject,
  removeDeployment,
  getAllDeployments,
  getDeployment,
  DEPLOYMENTS_DIR,
  UPLOADS_DIR
};
