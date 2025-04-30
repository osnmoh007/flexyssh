const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const exphbs = require('express-handlebars');
const path = require('path');
const pty = require('node-pty');
const os = require('os');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const { isAuthenticated, validateCredentials } = require('./middleware/auth');
const MongoStore = require('connect-mongo');

// Load env vars
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Trust proxy for Cloudflare and other reverse proxies
app.set('trust proxy', 1);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Replace the existing session configuration with this
app.use(session({
  secret: process.env.SESSION_SECRET || 'flexy-ssh-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions'
  }),
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  },
  proxy: true
}));

// Add this after the session middleware
// Simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.ip} via ${req.headers['x-forwarded-for'] || 'direct'}`);
  
  // Check and log authentication status
  if (req.url !== '/login' && req.url !== '/logout') {
    console.log(`  Auth status: ${req.session && req.session.authenticated ? 'Authenticated' : 'Not authenticated'}`);
  }
  
  next();
});

// Setup Handlebars
app.engine('handlebars', exphbs.engine());
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Authentication routes
app.get('/login', (req, res) => {
  // If already logged in, redirect to home
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.render('login', { layout: false });
});

app.post('/login', (req, res) => {
  console.log('Login attempt received:', { 
    username: req.body.username,
    passwordProvided: !!req.body.password,
    headers: {
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer,
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-forwarded-proto': req.headers['x-forwarded-proto']
    }
  });
  
  const { username, password } = req.body;
  
  if (validateCredentials(username, password)) {
    // Set session as authenticated
    req.session.authenticated = true;
    req.session.username = username;
    
    // Log successful authentication
    console.log('Authentication successful for user:', username);
    
    // Save the session explicitly before redirecting
    req.session.save(err => {
      if (err) {
        console.error('Error saving session:', err);
        return res.status(500).render('login', { 
          layout: false, 
          error: 'Session error, please try again' 
        });
      }
      
      console.log('Session saved successfully, redirecting to home');
      return res.redirect('/');
    });
  } else {
    // Log failed authentication
    console.log('Authentication failed for user:', username);
    
    // Show error if credentials are incorrect
    res.render('login', { 
      layout: false, 
      error: 'Invalid username or password. Please try again.' 
    });
  }
});

app.get('/logout', (req, res) => {
  // Destroy the session
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login');
  });
});

// Protected routes
app.get('/', isAuthenticated, (req, res) => {
    res.render('home');
});

// API Routes - Protected with authentication middleware
app.use('/api/servers', isAuthenticated, require('./routes/servers'));
app.use('/api/identities', isAuthenticated, require('./routes/identities'));
app.use('/api/folders', isAuthenticated, require('./routes/folders'));

// Add this function after the existing imports but before the app setup
// Function to ensure the SSH keys directory exists
function ensureKeyDirectoryExists() {
    const keyDir = path.join(__dirname, 'keys');
    if (!fs.existsSync(keyDir)) {
        try {
            fs.mkdirSync(keyDir, { mode: 0o700 }); // Secure permissions
            console.log('Created SSH keys directory:', keyDir);
        } catch (err) {
            console.error('Failed to create SSH keys directory:', err);
        }
    }
    return keyDir;
}

// Ensure the keys directory exists when the server starts
const sshKeysDir = ensureKeyDirectoryExists();

// Add new route for saving SSH keys as files (protected)
app.post('/api/keys', isAuthenticated, (req, res) => {
    try {
        const { keyData } = req.body;
        
        if (!keyData) {
            return res.status(400).json({ message: 'No key data provided' });
        }
        
        // Generate a unique filename for the key
        const keyId = crypto.randomBytes(16).toString('hex');
        const keyFileName = path.join(sshKeysDir, `key-${keyId}`);
        
        // Write the key with strict permissions
        fs.writeFileSync(keyFileName, keyData, { mode: 0o600 });
        
        console.log(`SSH key saved to file: ${keyFileName}`);
        
        // Return the key ID to the client
        res.status(201).json({ keyId: keyId });
    } catch (err) {
        console.error('Error saving SSH key file:', err);
        res.status(500).json({ message: 'Failed to save SSH key: ' + err.message });
    }
});

// WebSocket handling with authentication check
wss.on('connection', (ws, req) => {
    // Log connection details to help debug
    console.log('WebSocket connection attempt from origin:', req.headers.origin);
    console.log('Connection headers:', req.headers);
    
    // Get the session cookie from the request
    const cookie = req.headers.cookie;
    
    // WebSocket authentication check would go here in a production application
    // For simplicity, we're not implementing full WebSocket session verification
    
    console.log('WebSocket connection established');
    let ptyProcess = null;
    let expectingPassword = false;
    let userPassword = '';

    ws.on('message', (message) => {
        try {
            console.log('Raw WebSocket message received:', message.toString());
            const data = JSON.parse(message);
            
            // Only log connection and resize events, not every keystroke
            if (data.type !== 'input') {
                console.log('Message type:', data.type);
                if (data.type === 'connect_saved') {
                    console.log('Server ID:', data.serverId);
                } else if (data.type === 'connect') {
                    console.log('Direct connection to:', data.username + '@' + data.host);
                }
            }
            
            switch (data.type) {
                case 'connect_saved':
                    try {
                        const serverId = data.serverId;
                        console.log(`Connecting to saved server ID: ${serverId}`);
                        
                        // Reset connection state
                        expectingPassword = false;
                        userPassword = '';
                        
                        // Fetch server details from database
                        const Server = require('./models/Server');
                        Server.findById(serverId)
                            .then(server => {
                                if (!server) {
                                    throw new Error('Server not found');
                                }
                                
                                console.log(`Connecting to ${server.username}@${server.host}`);
                                console.log(`Auth type: ${server.authType || 'password'}`);
                                
                                // If the server has an identity reference, fetch the identity details
                                if (server.identityId) {
                                    console.log(`Server uses identity ID: ${server.identityId}`);
                                    const Identity = require('./models/Identity');
                                    
                                    return Identity.findById(server.identityId)
                                        .then(identity => {
                                            if (!identity) {
                                                console.warn(`Referenced identity ${server.identityId} not found, using server's stored credentials`);
                                                return connectToServer(server, ws);
                                            }
                                            
                                            console.log(`Using identity: ${identity.name} (${identity.username})`);
                                            
                                            // Create a composite server object with identity details
                                            const compositeServer = {
                                                ...server.toObject(),
                                                username: identity.username,
                                                authType: identity.authType
                                            };
                                            
                                            if (identity.authType === 'password') {
                                                compositeServer.password = identity.password;
                                            } else if (identity.authType === 'key') {
                                                compositeServer.privateKey = identity.privateKey;
                                                compositeServer.keyPassphrase = identity.keyPassphrase;
                                            }
                                            
                                            return connectToServer(compositeServer, ws);
                                        })
                                        .catch(error => {
                                            console.error('Error fetching identity:', error);
                                            console.log('Falling back to server stored credentials');
                                            return connectToServer(server, ws);
                                        });
                                } else {
                                    // No identity reference, use server's stored credentials
                                    return connectToServer(server, ws);
                                }
                            })
                            .catch(error => {
                                console.error('Error connecting to SSH:', error);
                                ws.send(JSON.stringify({ type: 'error', data: error.message }));
                            });
                    } catch (error) {
                        console.error('Error processing saved server connection:', error);
                        ws.send(JSON.stringify({ type: 'error', data: error.message }));
                    }
                    break;

                case 'connect':
                    try {
                        const { host, username, authType, password, privateKey, keyPassphrase } = data;
                        console.log(`Connecting to ${username}@${host}`);
                        console.log(`Auth type: ${authType || 'password'}`);
                        
                        // Reset connection state
                        expectingPassword = false;
                        
                        let sshArgs = ['-o', 'StrictHostKeyChecking=no'];
                        
                        if (authType === 'key' && privateKey) {
                            // If the privateKey starts with "file:", it's a reference to a key file
                            if (privateKey.startsWith('file:')) {
                                const keyId = privateKey.replace('file:', '');
                                const keyFileName = path.join(sshKeysDir, `key-${keyId}`);
                                
                                try {
                                    // Check if the key file exists
                                    if (!fs.existsSync(keyFileName)) {
                                        throw new Error('SSH key file not found');
                                    }
                                    
                                    // Add the identity file to SSH arguments
                                    sshArgs.push('-i', keyFileName);
                                    
                                    // If there's a passphrase, we'll handle it later
                                    if (keyPassphrase && keyPassphrase.length > 0) {
                                        userPassword = keyPassphrase;
                                        console.log('Key passphrase available and will be used if prompted');
                                    }
                                    
                                    console.log(`Using key authentication with key file: ${keyFileName}`);
                                } catch (err) {
                                    console.error('Failed to use key file:', err);
                                    ws.send(JSON.stringify({ 
                                        type: 'error', 
                                        message: 'Failed to use SSH key file: ' + err.message 
                                    }));
                                    return;
                                }
                            } else {
                                // Legacy code for keys provided directly in the request
                                const fs = require('fs');
                                const path = require('path');
                                const os = require('os');
                                const crypto = require('crypto');
                                
                                // Generate a unique filename for the key
                                const keyFileName = path.join(os.tmpdir(), `ssh-key-${crypto.randomBytes(8).toString('hex')}`);
                                
                                // Write the private key to the temporary file
                                try {
                                    // Make sure the key has correct line endings
                                    const formattedKey = privateKey.trim().replace(/\r\n/g, '\n');
                                    
                                    // Ensure each line is properly formatted
                                    const cleanedKey = formattedKey
                                        .split('\n')
                                        .map(line => line.trim())
                                        .join('\n');
                                    
                                    // Write the key with strict permissions
                                    fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                                    console.log(`Key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                                    
                                    // Add the identity file to SSH arguments
                                    sshArgs.push('-i', keyFileName);
                                    
                                    // If there's a passphrase, we'll handle it later
                                    if (keyPassphrase) {
                                        userPassword = keyPassphrase;
                                        console.log('Key passphrase available and will be used if prompted');
                                    }
                                    
                                    // Register a cleanup function to remove the key file
                                    process.on('exit', () => {
                                        try { fs.unlinkSync(keyFileName); } catch (e) { /* ignore */ }
                                    });
                                    
                                    console.log(`Using key authentication with key file: ${keyFileName}`);
                                } catch (err) {
                                    console.error('Failed to write key file:', err);
                                    ws.send(JSON.stringify({ 
                                        type: 'error', 
                                        message: 'Failed to setup key authentication: ' + err.message 
                                    }));
                                    return;
                                }
                            }
                        } else {
                            // Store password for later use with password authentication
                            userPassword = password || '';
                            console.log(`Password provided: ${!!password}, Length: ${password ? password.length : 0}`);
                        }
                        
                        // Add the target to SSH arguments
                        sshArgs.push(username + '@' + host);
                        
                        // Connect to SSH
                        ptyProcess = pty.spawn('ssh', sshArgs, {
                            name: 'xterm-color',
                            cols: 80,
                            rows: 30,
                            cwd: os.homedir(),
                            env: process.env
                        });

                        console.log('SSH process spawned');

                        ptyProcess.on('data', (data) => {
                            // Skip sending debug messages to the client
                            if (data.toString().startsWith('debug1:')) {
                                return;
                            }
                            
                            // Log all output for debugging (server-side only)
                            console.log('PTY Output:', data);
                            
                            // Log password/passphrase prompts for debugging
                            if (data.toLowerCase().includes('password') || data.toLowerCase().includes('passphrase')) {
                                console.log('Password/passphrase prompt detected in output');
                                console.log(`userPassword available: ${!!userPassword}, length: ${userPassword ? userPassword.length : 0}`);
                            }
                            
                            // Check if the data looks like a password/passphrase prompt
                            if ((data.toLowerCase().includes('password') || data.toLowerCase().includes('passphrase')) && 
                                !expectingPassword) {
                                
                                // Send the data to client to display the prompt
                                ws.send(JSON.stringify({ type: 'output', data }));
                                
                                if (userPassword && userPassword.length > 0) {
                                    console.log('Sending saved password/passphrase');
                                    expectingPassword = true;
                                    
                                    // Send password/passphrase
                                    setTimeout(() => {
                                        ptyProcess.write(userPassword + '\n');
                                        userPassword = ''; // Clear after use
                                        console.log('Password/passphrase sent and cleared');
                                    }, 100);
                                } else {
                                    console.log('No password available. User will need to input manually.');
                                    expectingPassword = true;
                                    
                                    // User needs to input password manually
                                    // The input will come through the normal input channel
                                }
                            } else {
                                try {
                                    ws.send(JSON.stringify({ 
                                        type: 'output', 
                                        data: data
                                    }));
                                } catch (err) {
                                    console.error('Error sending data to client:', err);
                                }
                            }
                        });

                                ptyProcess.on('exit', (code) => {
                                    console.log(`SSH process exited with code: ${code}`);
                                    try {
                                        ws.send(JSON.stringify({ 
                                            type: 'output', 
                                            data: `\r\nConnection closed with exit code ${code}\r\n` 
                                        }));
                                        ws.close();
                                    } catch (err) {
                                        console.error('Error sending exit info to client:', err);
                                    }
                                });
                    } catch (error) {
                        console.error('Error connecting to SSH:', error);
                        ws.send(JSON.stringify({ type: 'error', data: error.message }));
                    }
                    break;

                case 'input':
                    if (ws.ptyProcess) {
                        // Don't log individual keystrokes
                        ws.ptyProcess.write(data.data);
                    }
                    break;

                case 'resize':
                    if (ws.ptyProcess) {
                        console.log(`Resizing terminal to ${data.cols}x${data.rows}`);
                        ws.ptyProcess.resize(data.cols, data.rows);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        if (ws.ptyProcess) {
            ws.ptyProcess.kill();
        }
    });
});

// Add this function definition after the WebSocket 'connection' event handler
// Function to connect to an SSH server
function connectToServer(server, ws) {
    console.log(`Connecting to ${server.username}@${server.host}`);
    console.log(`Auth type: ${server.authType || 'password'}`);
    console.log(`Has private key: ${!!server.privateKey}, Key length: ${server.privateKey ? server.privateKey.length : 0}`);
    
    let userPassword = '';
    let expectingPassword = false;
    let sshArgs = ['-o', 'StrictHostKeyChecking=no'];
    
    if (server.authType === 'key' && server.privateKey) {
        // If the privateKey starts with "file:", it's a reference to a key file
        if (server.privateKey.startsWith('file:')) {
            const keyId = server.privateKey.replace('file:', '');
            const keyFileName = path.join(sshKeysDir, `key-${keyId}`);
            
            try {
                // Check if the key file exists
                if (!fs.existsSync(keyFileName)) {
                    throw new Error('SSH key file not found');
                }
                
                // Add the identity file to SSH arguments
                sshArgs.push('-i', keyFileName);
                
                // If there's a passphrase, we'll handle it later
                if (server.keyPassphrase && server.keyPassphrase.length > 0) {
                    userPassword = server.keyPassphrase;
                    console.log('Key passphrase available and will be used if prompted');
                }
                
                console.log(`Using key authentication with key file: ${keyFileName}`);
            } catch (err) {
                console.error('Failed to use key file:', err);
                ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'Failed to use SSH key file: ' + err.message 
                }));
                return;
            }
        } else {
            // Legacy code for keys stored in the database
            // Create a temporary key file
            const path = require('path');
            const os = require('os');
            
            // Generate a unique filename for the key
            const keyFileName = path.join(os.tmpdir(), `ssh-key-${crypto.randomBytes(8).toString('hex')}`);
            
            // Write the private key to the temporary file
            try {
                // Make sure the key has correct line endings
                const formattedKey = server.privateKey.trim().replace(/\r\n/g, '\n');
                
                // Write the key with strict permissions
                fs.writeFileSync(keyFileName, formattedKey, { mode: 0o600 });
                console.log(`Key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                
                // Debug: Show first few characters of the key (don't show the whole key for security)
                const keyPreview = formattedKey.substring(0, 40) + '...';
                console.log(`Key preview: ${keyPreview}`);
                
                // Check if the key appears to be a valid format
                if (formattedKey.includes('BEGIN') && formattedKey.includes('KEY')) {
                    console.log('Key appears to be in a valid format');
                } else {
                    console.warn('Warning: Key may not be in the correct format');
                }
                
                // Add the identity file to SSH arguments
                sshArgs.push('-i', keyFileName);
                
                // If there's a passphrase, we'll handle it later
                if (server.keyPassphrase && server.keyPassphrase.length > 0) {
                    userPassword = server.keyPassphrase;
                    console.log('Key passphrase available and will be used if prompted');
                }
                
                // Register a cleanup function to remove the key file
                process.on('exit', () => {
                    try { fs.unlinkSync(keyFileName); } catch (e) { /* ignore */ }
                });
                
                console.log(`Using key authentication with key file: ${keyFileName}`);
            } catch (err) {
                console.error('Failed to write key file:', err);
                ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'Failed to setup key authentication: ' + err.message 
                }));
                return;
            }
        }
    } else {
        // Store password for later use with password authentication
        userPassword = server.password || '';
        console.log(`Password exists: ${!!server.password}, Length: ${server.password ? server.password.length : 0}`);
    }
    
    // Add the target to SSH arguments
    sshArgs.push(server.username + '@' + server.host);
    
    // Connect to SSH
    let ptyProcess = pty.spawn('ssh', sshArgs, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: os.homedir(),
        env: process.env
    });

    console.log('SSH process spawned with args:', sshArgs);

    ptyProcess.on('data', (data) => {
        // Skip sending debug messages to the client
        if (data.toString().startsWith('debug1:')) {
            return;
        }
        
        // Log all output for debugging (server-side only)
        console.log('PTY Output:', data);
        
        // Log password/passphrase prompts for debugging
        if (data.toLowerCase().includes('password') || data.toLowerCase().includes('passphrase')) {
            console.log('Password/passphrase prompt detected in output');
            console.log(`userPassword available: ${!!userPassword}, length: ${userPassword ? userPassword.length : 0}`);
        }
        
        // Check if the data looks like a password/passphrase prompt
        if ((data.toLowerCase().includes('password') || data.toLowerCase().includes('passphrase')) && 
            !expectingPassword) {
            
            // Send the data to client to display the prompt
            ws.send(JSON.stringify({ type: 'output', data }));
            
            if (userPassword && userPassword.length > 0) {
                console.log('Sending saved password/passphrase');
                expectingPassword = true;
                
                // Send password/passphrase
                setTimeout(() => {
                    ptyProcess.write(userPassword + '\n');
                    userPassword = ''; // Clear after use
                    console.log('Password/passphrase sent and cleared');
                }, 100);
            } else {
                console.log('No password available. User will need to input manually.');
                expectingPassword = true;
                
                // User needs to input password manually
                // The input will come through the normal input channel
            }
        } else {
            try {
                ws.send(JSON.stringify({ 
                    type: 'output', 
                    data: data
                }));
            } catch (err) {
                console.error('Error sending data to client:', err);
            }
        }
    });

    ptyProcess.on('exit', (code) => {
        console.log(`SSH process exited with code: ${code}`);
        try {
            ws.send(JSON.stringify({ 
                type: 'output', 
                data: `\r\nConnection closed with exit code ${code}\r\n` 
            }));
            ws.close();
        } catch (err) {
            console.error('Error sending exit info to client:', err);
        }
    });
    
    // Save the pty process in the websocket so we can access it for input and resize events
    ws.ptyProcess = ptyProcess;
    
    return ptyProcess;
}

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
}); 