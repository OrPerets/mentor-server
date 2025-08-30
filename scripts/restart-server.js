/**
 * Helper script to restart the mentor-server with the new sync fixes
 * Run this from the mentor-server directory: node restart-server.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔄 Restarting mentor-server with grading sync fixes...\n');

// Kill any existing node processes running on port 3001
const killExisting = () => {
  return new Promise((resolve) => {
    const killCmd = process.platform === 'win32' 
      ? 'taskkill /F /IM node.exe' 
      : 'pkill -f "node.*3001" || true';
    
    const kill = spawn('sh', ['-c', killCmd], { stdio: 'inherit' });
    kill.on('close', () => {
      console.log('✅ Stopped existing server processes\n');
      resolve();
    });
  });
};

// Start the server
const startServer = () => {
  console.log('🚀 Starting mentor-server...\n');
  
  const server = spawn('node', ['api/index.js'], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  server.on('error', (err) => {
    console.error('❌ Failed to start server:', err);
  });
  
  server.on('close', (code) => {
    console.log(`\n📝 Server exited with code ${code}`);
  });
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    server.kill('SIGINT');
    process.exit(0);
  });
};

// Main execution
async function main() {
  await killExisting();
  startServer();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { killExisting, startServer };