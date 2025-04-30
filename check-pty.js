const pty = require('node-pty');
const os = require('os');

console.log('Testing node-pty installation...');

try {
    // Try to spawn a simple command
    const ptyProcess = pty.spawn('ls', [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: os.homedir(),
        env: process.env
    });

    ptyProcess.on('data', function(data) {
        console.log('Data received:', data);
    });

    ptyProcess.on('exit', function(code) {
        console.log('Process exited with code', code);
        console.log('node-pty is working correctly!');
    });

    // Close the process after a short time
    setTimeout(() => {
        ptyProcess.kill();
        console.log('Test completed successfully.');
    }, 3000);
} catch (error) {
    console.error('Error spawning process with node-pty:', error);
    console.error('node-pty might not be installed correctly.');
    console.error('Try running: npm rebuild node-pty');
} 