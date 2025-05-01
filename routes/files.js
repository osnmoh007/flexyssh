const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const multer = require('multer');

// Ensure temp directory exists
const tempDir = path.join(os.tmpdir(), 'flexyssh-uploads');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer for file uploads with filename preservation
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, tempDir);
    },
    filename: function(req, file, cb) {
        // Use the original filename directly
        cb(null, file.originalname);
    }
});

// Configure multer with the storage engine
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// Ensure temp directory exists for downloads
const downloadTempDir = path.join(os.tmpdir(), 'flexyssh-downloads');
if (!fs.existsSync(downloadTempDir)) {
    fs.mkdirSync(downloadTempDir, { recursive: true });
}

// Download a file from a server
router.post('/download', async (req, res) => {
    try {
        const { serverId, filePath } = req.body;
        
        if (!serverId || !filePath) {
            return res.status(400).json({ 
                success: false, 
                message: 'Server ID and file path are required' 
            });
        }

        // Get server details from database
        const Server = require('../models/Server');
        const server = await Server.findById(serverId);
        
        if (!server) {
            return res.status(404).json({ 
                success: false, 
                message: 'Server not found' 
            });
        }
        
        // Generate a unique filename for the temp file
        const fileName = path.basename(filePath);
        const tempFileName = `${crypto.randomBytes(8).toString('hex')}-${fileName}`;
        const tempFilePath = path.join(downloadTempDir, tempFileName);
        
        // Determine if we need to use an identity
        let sshArgs = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes'
        ];
        
        // If the server has an identity, fetch it
        if (server.identityId) {
            const Identity = require('../models/Identity');
            try {
                const identity = await Identity.findById(server.identityId);
                if (identity) {
                    // Use identity details
                    if (identity.authType === 'key' && identity.privateKey) {
                        // Check if the privateKey is a reference to a key file
                        if (identity.privateKey.startsWith('file:')) {
                            const keyId = identity.privateKey.replace('file:', '');
                            const keyFileName = path.join(__dirname, '..', 'keys', `key-${keyId}`);
                            
                            try {
                                // Check if the key file exists
                                if (!fs.existsSync(keyFileName)) {
                                    throw new Error(`SSH key file not found: ${keyFileName}`);
                                }
                                
                                console.log(`Using key file: ${keyFileName}`);
                                sshArgs.push('-i', keyFileName);
                                
                                // If the key has a passphrase, use sshpass for providing it
                                if (identity.keyPassphrase) {
                                    const sshpassPath = await getSshpassPath();
                                    if (sshpassPath) {
                                        return downloadWithSshpass(
                                            res,
                                            sshpassPath,
                                            identity.keyPassphrase,
                                            identity.username,
                                            server.host,
                                            server.port || 22,
                                            filePath,
                                            tempFilePath,
                                            fileName,
                                            keyFileName  // Pass the key file
                                        );
                                    }
                                }
                                
                                // Add port to SSH args for the key file format
                                sshArgs.push('-p', (server.port || 22).toString());
                            } catch (err) {
                                console.error('Failed to use key file:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    message: 'Failed to use SSH key file: ' + err.message 
                                });
                            }
                        } else {
                            // Handle key authentication with the identity's key text
                            const keyFileName = path.join(downloadTempDir, `key-${crypto.randomBytes(8).toString('hex')}`);
                            
                            // Make sure the key has correct line endings
                            const formattedKey = identity.privateKey.trim().replace(/\r\n/g, '\n');
                            
                            // Ensure each line is properly formatted
                            const cleanedKey = formattedKey
                                .split('\n')
                                .map(line => line.trim())
                                .join('\n');
                            
                            // Write the key with strict permissions
                            fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                            console.log(`Key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                            
                            // Check if the key appears to be a valid format
                            if (cleanedKey.includes('BEGIN') && cleanedKey.includes('KEY')) {
                                console.log('Key appears to be in a valid format');
                            } else {
                                console.warn('Warning: Key may not be in the correct format');
                            }
                            
                            sshArgs.push('-i', keyFileName);
                            
                            // If the key has a passphrase, use sshpass for providing it
                            if (identity.keyPassphrase) {
                                const sshpassPath = await getSshpassPath();
                                if (sshpassPath) {
                                    return downloadWithSshpass(
                                        res,
                                        sshpassPath,
                                        identity.keyPassphrase,
                                        identity.username,
                                        server.host,
                                        server.port || 22,
                                        filePath,
                                        tempFilePath,
                                        fileName,
                                        keyFileName  // Pass the key file
                                    );
                                }
                            }
                            
                            // Clean up key file when done
                            res.on('finish', () => {
                                try { fs.unlinkSync(keyFileName); } catch(e) { /* ignore */ }
                            });
                        }
                    } else if (identity.authType === 'password' && identity.password) {
                        // For password auth, we'll use sshpass
                        const sshpassPath = await getSshpassPath();
                        if (sshpassPath) {
                            // Use sshpass to provide the password
                            return downloadWithSshpass(
                                res, 
                                sshpassPath,
                                identity.password,
                                identity.username,
                                server.host,
                                server.port || 22,
                                filePath,
                                tempFilePath,
                                fileName
                            );
                        } else {
                            // Fall back to direct server credentials
                            console.warn('sshpass not found, falling back to server credentials');
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading identity:', err);
                // Fall back to server credentials
            }
        }
        
        // If we get here, either no identity was found or we're using a key from the identity
        // Use server credentials
        const username = server.username;
        const host = server.host;
        const port = server.port || 22;
        
        // If using password auth and no identity handled it, try sshpass
        if (server.authType === 'password' && server.password) {
            const sshpassPath = await getSshpassPath();
            if (sshpassPath) {
                return downloadWithSshpass(
                    res, 
                    sshpassPath,
                    server.password,
                    username,
                    host,
                    port,
                    filePath,
                    tempFilePath,
                    fileName
                );
            } else {
                // If sshpass is not available, return an error - we can't proceed without it
                console.error('Cannot download file: sshpass not available and password authentication is required');
                
                // Try using a temporary expect script as fallback
                return tryDownloadWithExpect(
                    res,
                    server.password,
                    username,
                    host,
                    port,
                    filePath,
                    tempFilePath,
                    fileName
                );
            }
        }
        
        // If this is a key-based auth from the server itself
        if (server.authType === 'key' && server.privateKey) {
            // Check if the privateKey is a reference to a key file
            if (server.privateKey.startsWith('file:')) {
                const keyId = server.privateKey.replace('file:', '');
                const keyFileName = path.join(__dirname, '..', 'keys', `key-${keyId}`);
                
                try {
                    // Check if the key file exists
                    if (!fs.existsSync(keyFileName)) {
                        throw new Error(`SSH key file not found: ${keyFileName}`);
                    }
                    
                    console.log(`Using server key file: ${keyFileName}`);
                    sshArgs.push('-i', keyFileName);
                    
                    // If the key has a passphrase, use sshpass for providing it
                    if (server.keyPassphrase) {
                        const sshpassPath = await getSshpassPath();
                        if (sshpassPath) {
                            return downloadWithSshpass(
                                res,
                                sshpassPath,
                                server.keyPassphrase,
                                username,
                                host,
                                port,
                                filePath,
                                tempFilePath,
                                fileName,
                                keyFileName  // Pass the key file
                            );
                        }
                    }
                    
                    // Add port to SSH args for the key file format
                    sshArgs.push('-p', port.toString());
                } catch (err) {
                    console.error('Failed to use server key file:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Failed to use SSH key file: ' + err.message 
                    });
                }
            } else {
                // Handle key authentication with the server's key text
                const keyFileName = path.join(downloadTempDir, `key-${crypto.randomBytes(8).toString('hex')}`);
                
                // Make sure the key has correct line endings
                const formattedKey = server.privateKey.trim().replace(/\r\n/g, '\n');
                
                // Ensure each line is properly formatted
                const cleanedKey = formattedKey
                    .split('\n')
                    .map(line => line.trim())
                    .join('\n');
                
                // Write the key with strict permissions
                fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                console.log(`Server key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                
                // Check if the key appears to be a valid format
                if (cleanedKey.includes('BEGIN') && cleanedKey.includes('KEY')) {
                    console.log('Server key appears to be in a valid format');
                } else {
                    console.warn('Warning: Server key may not be in the correct format');
                }
                
                sshArgs.push('-i', keyFileName);
                
                // If the key has a passphrase, use sshpass for providing it
                if (server.keyPassphrase) {
                    const sshpassPath = await getSshpassPath();
                    if (sshpassPath) {
                        return downloadWithSshpass(
                            res,
                            sshpassPath,
                            server.keyPassphrase,
                            username,
                            host,
                            port,
                            filePath,
                            tempFilePath,
                            fileName,
                            keyFileName  // Pass the key file
                        );
                    }
                }
                
                // Clean up key file when done
                res.on('finish', () => {
                    try { fs.unlinkSync(keyFileName); } catch(e) { /* ignore */ }
                });
            }
        }
        
        // If we get here, we're using the SSH key approach without a passphrase
        // Add port to SSH args
        sshArgs.push('-p', port.toString());
        
        // Add the target server info
        sshArgs.push(`${username}@${host}`);
        
        // Add the SCP command to copy the file
        sshArgs.push('cat');
        sshArgs.push(filePath);
        
        // Spawn the SSH process
        console.log('Running SSH command with args:', sshArgs.join(' '));
        const sshProcess = spawn('ssh', sshArgs);
        
        // Create a write stream to save the file
        const fileStream = fs.createWriteStream(tempFilePath);
        
        // Pipe the SSH output to the file
        sshProcess.stdout.pipe(fileStream);
        
        // Handle errors
        let errorOutput = '';
        sshProcess.stderr.on('data', (data) => {
            const errorText = data.toString();
            errorOutput += errorText;
            
            // Log specific error types for debugging
            if (errorText.includes('Permission denied')) {
                console.error('SSH authentication error:', errorText);
            } else if (errorText.includes('No such file')) {
                console.error('File not found error:', errorText);
            } else {
                console.error('SSH stderr output:', errorText);
            }
        });
        
        sshProcess.on('error', (error) => {
            console.error('SSH process error:', error);
            // Clean up temp file
            try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
            return res.status(500).json({ 
                success: false, 
                message: 'SSH process error: ' + error.message 
            });
        });
        
        sshProcess.on('close', (code) => {
            fileStream.end();
            
            if (code !== 0) {
                console.error('SSH process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                // Clean up temp file
                try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'SSH process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Send the file to the client
            res.download(tempFilePath, fileName, (err) => {
                // Clean up the temp file after sending it
                try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
                
                if (err) {
                    console.error('Error sending file:', err);
                    if (!res.headersSent) {
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Error sending file: ' + err.message 
                        });
                    }
                }
            });
        });
        
    } catch (error) {
        console.error('File download error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error: ' + error.message 
        });
    }
});

// Upload a file to a remote server
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // First check if file was uploaded correctly
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file was uploaded. Please select a file.'
            });
        }
        
        const { serverId, remotePath } = req.body;
        
        // Get the original filename from req.file
        const originalFilename = req.file.originalname;
        console.log(`Processing upload of ${originalFilename} to ${remotePath}`);
        
        // The local path of the uploaded file
        const uploadedFilePath = req.file.path;
        console.log(`Local temp file: ${uploadedFilePath}`);
        
        // Check if required fields are provided
        if (!serverId) {
            // Clean up temp file if it exists
            try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
            
            return res.status(400).json({ 
                success: false, 
                message: 'Server ID is required to identify the target server' 
            });
        }
        
        if (!remotePath) {
            // Clean up temp file
            try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
            
            return res.status(400).json({ 
                success: false, 
                message: 'Remote path is required to specify upload location' 
            });
        }

        // Get server details from database
        const Server = require('../models/Server');
        const server = await Server.findById(serverId);
        
        if (!server) {
            // Clean up temp file
            try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
            
            return res.status(404).json({ 
                success: false, 
                message: 'Server not found' 
            });
        }
        
        // Construct the remote file path
        let remoteFilePath = remotePath;
        if (remotePath.endsWith('/')) {
            // If remotePath is a directory, append the original filename
            remoteFilePath = path.join(remotePath, originalFilename);
        }
        
        // Determine if we need to use an identity
        let sshArgs = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes'
        ];
        
        // If the server has an identity, fetch it
        if (server.identityId) {
            const Identity = require('../models/Identity');
            try {
                const identity = await Identity.findById(server.identityId);
                if (identity) {
                    // Use identity details
                    if (identity.authType === 'key' && identity.privateKey) {
                        // Check if the privateKey is a reference to a key file
                        if (identity.privateKey.startsWith('file:')) {
                            const keyId = identity.privateKey.replace('file:', '');
                            const keyFileName = path.join(__dirname, '..', 'keys', `key-${keyId}`);
                            
                            try {
                                // Check if the key file exists
                                if (!fs.existsSync(keyFileName)) {
                                    throw new Error(`SSH key file not found: ${keyFileName}`);
                                }
                                
                                console.log(`Using key file: ${keyFileName}`);
                                sshArgs.push('-i', keyFileName);
                                
                                // If the key has a passphrase, use sshpass for providing it
                                if (identity.keyPassphrase) {
                                    const sshpassPath = await getSshpassPath();
                                    if (sshpassPath) {
                                        return uploadWithSshpass(
                                            res,
                                            sshpassPath,
                                            identity.keyPassphrase,
                                            identity.username,
                                            server.host,
                                            server.port || 22,
                                            uploadedFilePath,
                                            remoteFilePath,
                                            keyFileName  // Pass the key file
                                        );
                                    }
                                }
                            } catch (err) {
                                console.error('Failed to use key file:', err);
                                // Clean up temp file
                                try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
                                
                                return res.status(500).json({ 
                                    success: false, 
                                    message: 'Failed to use SSH key file: ' + err.message 
                                });
                            }
                        } else {
                            // Handle key authentication with the identity's key text
                            const keyFileName = path.join(downloadTempDir, `key-${crypto.randomBytes(8).toString('hex')}`);
                            
                            // Make sure the key has correct line endings
                            const formattedKey = identity.privateKey.trim().replace(/\r\n/g, '\n');
                            
                            // Ensure each line is properly formatted
                            const cleanedKey = formattedKey
                                .split('\n')
                                .map(line => line.trim())
                                .join('\n');
                            
                            // Write the key with strict permissions
                            fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                            console.log(`Key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                            
                            // Check if the key appears to be a valid format
                            if (cleanedKey.includes('BEGIN') && cleanedKey.includes('KEY')) {
                                console.log('Key appears to be in a valid format');
                            } else {
                                console.warn('Warning: Key may not be in the correct format');
                            }
                            
                            sshArgs.push('-i', keyFileName);
                            
                            // If the key has a passphrase, use sshpass for providing it
                            if (identity.keyPassphrase) {
                                const sshpassPath = await getSshpassPath();
                                if (sshpassPath) {
                                    return uploadWithSshpass(
                                        res,
                                        sshpassPath,
                                        identity.keyPassphrase,
                                        identity.username,
                                        server.host,
                                        server.port || 22,
                                        uploadedFilePath,
                                        remoteFilePath,
                                        keyFileName  // Pass the key file
                                    );
                                }
                            }
                            
                            // Clean up key file when done
                            res.on('finish', () => {
                                try { fs.unlinkSync(keyFileName); } catch(e) { /* ignore */ }
                            });
                        }
                    } else if (identity.authType === 'password' && identity.password) {
                        // For password auth, we'll use sshpass
                        const sshpassPath = await getSshpassPath();
                        if (sshpassPath) {
                            // Use sshpass to provide the password
                            return uploadWithSshpass(
                                res, 
                                sshpassPath,
                                identity.password,
                                identity.username,
                                server.host,
                                server.port || 22,
                                uploadedFilePath,
                                remoteFilePath
                            );
                        } else {
                            // Fall back to direct server credentials
                            console.warn('sshpass not found, falling back to server credentials');
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading identity:', err);
                // Fall back to server credentials
            }
        }
        
        // If we get here, either no identity was found or we're using a key from the identity
        // Use server credentials
        const username = server.username;
        const host = server.host;
        const port = server.port || 22;
        
        // If using password auth and no identity handled it, try sshpass
        if (server.authType === 'password' && server.password) {
            const sshpassPath = await getSshpassPath();
            if (sshpassPath) {
                return uploadWithSshpass(
                    res, 
                    sshpassPath,
                    server.password,
                    username,
                    host,
                    port,
                    uploadedFilePath,
                    remoteFilePath
                );
            } else {
                // If sshpass is not available, return an error
                console.error('Cannot upload file: sshpass not available and password authentication is required');
                
                // Clean up temp file
                try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'File upload failed: password authentication requires sshpass which is not available on this server' 
                });
            }
        }
        
        // If this is a key-based auth from the server itself
        if (server.authType === 'key' && server.privateKey) {
            // Check if the privateKey is a reference to a key file
            if (server.privateKey.startsWith('file:')) {
                const keyId = server.privateKey.replace('file:', '');
                const keyFileName = path.join(__dirname, '..', 'keys', `key-${keyId}`);
                
                try {
                    // Check if the key file exists
                    if (!fs.existsSync(keyFileName)) {
                        throw new Error(`SSH key file not found: ${keyFileName}`);
                    }
                    
                    console.log(`Using server key file: ${keyFileName}`);
                    sshArgs.push('-i', keyFileName);
                    
                    // If the key has a passphrase, use sshpass for providing it
                    if (server.keyPassphrase) {
                        const sshpassPath = await getSshpassPath();
                        if (sshpassPath) {
                            return uploadWithSshpass(
                                res,
                                sshpassPath,
                                server.keyPassphrase,
                                username,
                                host,
                                port,
                                uploadedFilePath,
                                remoteFilePath,
                                keyFileName  // Pass the key file
                            );
                        }
                    }
                } catch (err) {
                    console.error('Failed to use server key file:', err);
                    // Clean up temp file
                    try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
                    
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Failed to use SSH key file: ' + err.message 
                    });
                }
            } else {
                // Handle key authentication with the server's key text
                const keyFileName = path.join(downloadTempDir, `key-${crypto.randomBytes(8).toString('hex')}`);
                
                // Make sure the key has correct line endings
                const formattedKey = server.privateKey.trim().replace(/\r\n/g, '\n');
                
                // Ensure each line is properly formatted
                const cleanedKey = formattedKey
                    .split('\n')
                    .map(line => line.trim())
                    .join('\n');
                
                // Write the key with strict permissions
                fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                console.log(`Server key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                
                // Check if the key appears to be a valid format
                if (cleanedKey.includes('BEGIN') && cleanedKey.includes('KEY')) {
                    console.log('Server key appears to be in a valid format');
                } else {
                    console.warn('Warning: Server key may not be in the correct format');
                }
                
                sshArgs.push('-i', keyFileName);
                
                // If the key has a passphrase, use sshpass for providing it
                if (server.keyPassphrase) {
                    const sshpassPath = await getSshpassPath();
                    if (sshpassPath) {
                        return uploadWithSshpass(
                            res,
                            sshpassPath,
                            server.keyPassphrase,
                            username,
                            host,
                            port,
                            uploadedFilePath,
                            remoteFilePath,
                            keyFileName  // Pass the key file
                        );
                    }
                }
                
                // Clean up key file when done
                res.on('finish', () => {
                    try { fs.unlinkSync(keyFileName); } catch(e) { /* ignore */ }
                });
            }
        }
        
        // If we get here, we're using the SSH key approach without a passphrase
        // Add port to SSH args
        sshArgs.push('-p', port.toString());
        
        // Add the SCP command to copy the file
        sshArgs = ['-o', 'StrictHostKeyChecking=no', '-P', port.toString()];
        
        if (sshArgs.includes('-i')) {
            // Copy the identity parameter if it exists
            const iIndex = sshArgs.indexOf('-i');
            sshArgs.push('-i', sshArgs[iIndex + 1]);
        }
        
        // Execute SCP to upload the file
        const scpProcess = spawn('scp', [...sshArgs, uploadedFilePath, `${username}@${host}:${remoteFilePath}`]);
        
        console.log(`Executing SCP from ${uploadedFilePath} to ${username}@${host}:${remoteFilePath}`);
        
        // Handle errors
        let errorOutput = '';
        scpProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('SCP stderr output:', data.toString());
        });
        
        scpProcess.on('error', (error) => {
            console.error('SCP process error:', error);
            // Clean up temp file
            try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
            return res.status(500).json({ 
                success: false, 
                message: 'SCP process error: ' + error.message 
            });
        });
        
        scpProcess.on('close', (code) => {
            // Clean up temp file after uploading
            try { fs.unlinkSync(uploadedFilePath); } catch(e) { /* ignore */ }
            
            if (code !== 0) {
                console.error('SCP process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'SCP process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Return success response
            res.status(200).json({ 
                success: true,
                message: 'File uploaded successfully',
                fileName: path.basename(remoteFilePath),
                path: remoteFilePath
            });
        });
        
    } catch (error) {
        console.error('File upload error:', error);
        
        // Clean up temp file if it exists
        if (req.file && req.file.path) {
            try { fs.unlinkSync(req.file.path); } catch(e) { /* ignore */ }
        }
        
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error: ' + error.message 
        });
    }
});

// Delete a file or directory on a remote server
router.post('/delete', async (req, res) => {
    try {
        const { serverId, filePath, isDirectory } = req.body;
        
        if (!serverId || !filePath) {
            return res.status(400).json({ 
                success: false, 
                message: 'Server ID and file path are required' 
            });
        }

        // Get server details from database
        const Server = require('../models/Server');
        const server = await Server.findById(serverId);
        
        if (!server) {
            return res.status(404).json({ 
                success: false, 
                message: 'Server not found' 
            });
        }
        
        // Determine if we need to use an identity
        let sshArgs = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes'
        ];
        
        // If the server has an identity, fetch it (same code as download route)
        if (server.identityId) {
            const Identity = require('../models/Identity');
            try {
                const identity = await Identity.findById(server.identityId);
                if (identity) {
                    // Use identity details
                    if (identity.authType === 'key' && identity.privateKey) {
                        // Check if the privateKey is a reference to a key file
                        if (identity.privateKey.startsWith('file:')) {
                            const keyId = identity.privateKey.replace('file:', '');
                            const keyFileName = path.join(__dirname, '..', 'keys', `key-${keyId}`);
                            
                            try {
                                // Check if the key file exists
                                if (!fs.existsSync(keyFileName)) {
                                    throw new Error(`SSH key file not found: ${keyFileName}`);
                                }
                                
                                console.log(`Using key file: ${keyFileName}`);
                                sshArgs.push('-i', keyFileName);
                            } catch (err) {
                                console.error('Failed to use key file:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    message: 'Failed to use SSH key file: ' + err.message 
                                });
                            }
                        } else {
                            // Handle key authentication with the identity's key text
                            const keyFileName = path.join(downloadTempDir, `key-${crypto.randomBytes(8).toString('hex')}`);
                            
                            // Make sure the key has correct line endings
                            const formattedKey = identity.privateKey.trim().replace(/\r\n/g, '\n');
                            
                            // Ensure each line is properly formatted
                            const cleanedKey = formattedKey
                                .split('\n')
                                .map(line => line.trim())
                                .join('\n');
                            
                            // Write the key with strict permissions
                            fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                            console.log(`Key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                            
                            sshArgs.push('-i', keyFileName);
                            
                            // Clean up key file when done
                            res.on('finish', () => {
                                try { fs.unlinkSync(keyFileName); } catch(e) { /* ignore */ }
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading identity:', err);
                // Fall back to server credentials
            }
        }
        
        // If we get here, either no identity was found or we're using a key from the identity
        // Use server credentials
        const username = server.username;
        const host = server.host;
        const port = server.port || 22;
        
        // Add port to SSH args
        sshArgs.push('-p', port.toString());
        
        // Add the target server info
        sshArgs.push(`${username}@${host}`);
        
        // Determine the command based on whether it's a file or directory
        let command;
        if (isDirectory) {
            // For directories, use rm -rf
            command = `rm -rf "${filePath}"`;
        } else {
            // For files, use simple rm
            command = `rm "${filePath}"`;
        }
        
        // Add the delete command
        sshArgs.push(command);
        
        // Spawn the SSH process
        console.log('Running SSH command with args:', sshArgs.join(' '));
        const sshProcess = spawn('ssh', sshArgs);
        
        // Handle errors
        let errorOutput = '';
        sshProcess.stderr.on('data', (data) => {
            const errorText = data.toString();
            errorOutput += errorText;
            console.error('SSH stderr output:', errorText);
        });
        
        sshProcess.on('error', (error) => {
            console.error('SSH process error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'SSH process error: ' + error.message 
            });
        });
        
        sshProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('SSH process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'SSH process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Return success response
            res.status(200).json({ 
                success: true,
                message: isDirectory ? 'Directory deleted successfully' : 'File deleted successfully',
                path: filePath
            });
        });
        
    } catch (error) {
        console.error('File deletion error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error: ' + error.message 
        });
    }
});

// Helper function to download using sshpass (for password auth)
async function downloadWithSshpass(res, sshpassPath, password, username, host, port, filePath, tempFilePath, fileName, keyFile = null) {
    try {
        // Create sshpass arguments
        const sshpassArgs = [
            '-p', password,
            'ssh',
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes',
            '-p', port.toString(),
        ];
        
        // If a key file is provided, add it to the arguments
        if (keyFile) {
            // Log some details about the key file for debugging
            try {
                const keyFileStats = fs.statSync(keyFile);
                console.log(`Using key file for sshpass: ${keyFile}, Size: ${keyFileStats.size} bytes`);
                
                // Read the first line of the key file to check its format
                const keyData = fs.readFileSync(keyFile, 'utf8').trim();
                const firstLine = keyData.split('\n')[0];
                console.log(`Key file first line: ${firstLine}`);
                
                if (keyData.includes('BEGIN') && keyData.includes('KEY')) {
                    console.log('Key file appears to be in a valid format');
                } else {
                    console.warn('Warning: Key file may not be in the correct format');
                }
            } catch (err) {
                console.error('Error examining key file:', err);
            }
            
            sshpassArgs.push('-i', keyFile);
        }
        
        // Add the target server info
        sshpassArgs.push(`${username}@${host}`);
        
        // Add the command to copy the file
        sshpassArgs.push('cat');
        sshpassArgs.push(filePath);
        
        console.log('Running sshpass with SSH command:', sshpassArgs.join(' ').replace(password, '********'));
        
        // Spawn sshpass process
        const sshpassProcess = spawn(sshpassPath, sshpassArgs);
        
        // Create a write stream to save the file
        const fileStream = fs.createWriteStream(tempFilePath);
        
        // Pipe the output to the file
        sshpassProcess.stdout.pipe(fileStream);
        
        // Handle errors
        let errorOutput = '';
        sshpassProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        sshpassProcess.on('error', (error) => {
            console.error('sshpass process error:', error);
            // Clean up temp file
            try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
            return res.status(500).json({ 
                success: false, 
                message: 'sshpass process error: ' + error.message 
            });
        });
        
        sshpassProcess.on('close', (code) => {
            fileStream.end();
            
            if (code !== 0) {
                console.error('sshpass process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                // Clean up temp file
                try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'sshpass process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Send the file to the client
            res.download(tempFilePath, fileName, (err) => {
                // Clean up the temp file after sending it
                try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
                
                if (err) {
                    console.error('Error sending file:', err);
                    if (!res.headersSent) {
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Error sending file: ' + err.message 
                        });
                    }
                }
            });
        });
    } catch (error) {
        console.error('sshpass download error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error with sshpass: ' + error.message 
        });
    }
}

// Helper function to upload using sshpass (for password auth)
async function uploadWithSshpass(res, sshpassPath, password, username, host, port, localFilePath, remoteFilePath, keyFile = null) {
    try {
        // Create sshpass arguments
        const sshpassArgs = [
            '-p', password,
            'scp',
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes',
            '-P', port.toString(),
        ];
        
        // If a key file is provided, add it to the arguments
        if (keyFile) {
            // Log some details about the key file for debugging
            try {
                const keyFileStats = fs.statSync(keyFile);
                console.log(`Using key file for sshpass: ${keyFile}, Size: ${keyFileStats.size} bytes`);
                
                // Read the first line of the key file to check its format
                const keyData = fs.readFileSync(keyFile, 'utf8').trim();
                const firstLine = keyData.split('\n')[0];
                console.log(`Key file first line: ${firstLine}`);
                
                if (keyData.includes('BEGIN') && keyData.includes('KEY')) {
                    console.log('Key file appears to be in a valid format');
                } else {
                    console.warn('Warning: Key file may not be in the correct format');
                }
            } catch (err) {
                console.error('Error examining key file:', err);
            }
            
            sshpassArgs.push('-i', keyFile);
        }
        
        // Add the file paths
        sshpassArgs.push(localFilePath, `${username}@${host}:${remoteFilePath}`);
        
        console.log('Running sshpass with SCP command:', sshpassArgs.join(' ').replace(password, '********'));
        
        // Spawn sshpass process
        const sshpassProcess = spawn(sshpassPath, sshpassArgs);
        
        // Handle errors
        let errorOutput = '';
        sshpassProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('sshpass stderr:', data.toString());
        });
        
        sshpassProcess.on('error', (error) => {
            console.error('sshpass process error:', error);
            // Clean up temp file
            try { fs.unlinkSync(localFilePath); } catch(e) { /* ignore */ }
            return res.status(500).json({ 
                success: false, 
                message: 'sshpass process error: ' + error.message 
            });
        });
        
        sshpassProcess.on('close', (code) => {
            // Clean up temp file
            try { fs.unlinkSync(localFilePath); } catch(e) { /* ignore */ }
            
            if (code !== 0) {
                console.error('sshpass process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'sshpass process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Return success response
            res.status(200).json({ 
                success: true,
                message: 'File uploaded successfully',
                fileName: path.basename(remoteFilePath),
                path: remoteFilePath
            });
        });
    } catch (error) {
        console.error('sshpass upload error:', error);
        
        // Clean up temp file
        try { fs.unlinkSync(localFilePath); } catch(e) { /* ignore */ }
        
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error with sshpass: ' + error.message 
        });
    }
}

// Helper to find sshpass path
async function getSshpassPath() {
    try {
        // Common paths where sshpass might be found
        const commonPaths = [
            '/usr/bin/sshpass',
            '/usr/local/bin/sshpass',
            '/opt/homebrew/bin/sshpass'
        ];
        
        // Check if any of the common paths exist
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        
        // Try to find it using the which command
        return new Promise((resolve) => {
            const whichProcess = spawn('which', ['sshpass']);
            let output = '';
            
            whichProcess.stdout.on('data', (data) => {
                output += data.toString().trim();
            });
            
            whichProcess.on('close', (code) => {
                if (code === 0 && output) {
                    resolve(output);
                } else {
                    resolve(null);
                }
            });
            
            whichProcess.on('error', () => {
                resolve(null);
            });
        });
    } catch (err) {
        console.error('Error finding sshpass:', err);
        return null;
    }
}

// Helper function to try downloading using an expect script
async function tryDownloadWithExpect(res, password, username, host, port, filePath, tempFilePath, fileName) {
    try {
        // Check if expect is installed
        const expectPath = await getExpectPath();
        if (!expectPath) {
            return res.status(500).json({
                success: false,
                message: 'File download failed: neither sshpass nor expect are available on this server'
            });
        }

        // Create temporary expect script
        const expectScriptPath = path.join(tempDir, `expect-${crypto.randomBytes(8).toString('hex')}.exp`);
        
        // Build the SSH command
        const sshCommand = `ssh -o StrictHostKeyChecking=no -p ${port} ${username}@${host} cat "${filePath}"`;
        
        // Create the expect script content for password authentication
        const scriptContent = `#!/usr/bin/expect -f
spawn ${sshCommand}
expect "password:"
send "${password}\\r"
interact`;

        fs.writeFileSync(expectScriptPath, scriptContent, { mode: 0o700 });
        console.log(`Created expect script at ${expectScriptPath}`);
        
        // Execute the expect script
        const expectProcess = spawn(expectPath, [expectScriptPath]);
        const fileStream = fs.createWriteStream(tempFilePath);
        expectProcess.stdout.pipe(fileStream);

        let errorOutput = '';
        expectProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('Expect stderr:', data.toString());
        });

        expectProcess.on('error', (error) => {
            console.error('Expect process error:', error);
            // Clean up temp files
            try { 
                fs.unlinkSync(tempFilePath); 
                fs.unlinkSync(expectScriptPath);
            } catch(e) { /* ignore */ }
            
            return res.status(500).json({ 
                success: false, 
                message: 'Expect process error: ' + error.message 
            });
        });

        expectProcess.on('close', (code) => {
            fileStream.end();
            
            // Clean up the expect script
            try { fs.unlinkSync(expectScriptPath); } catch(e) { /* ignore */ }
            
            if (code !== 0) {
                console.error('Expect process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                // Clean up temp file
                try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'Expect process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Send the file to the client
            res.download(tempFilePath, fileName, (err) => {
                // Clean up the temp file after sending it
                try { fs.unlinkSync(tempFilePath); } catch(e) { /* ignore */ }
                
                if (err) {
                    console.error('Error sending file:', err);
                    if (!res.headersSent) {
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Error sending file: ' + err.message 
                        });
                    }
                }
            });
        });
    } catch (error) {
        console.error('Expect download error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error with expect script: ' + error.message 
        });
    }
}

// Helper to find expect path
async function getExpectPath() {
    try {
        // Common paths where expect might be found
        const commonPaths = [
            '/usr/bin/expect',
            '/usr/local/bin/expect',
            '/opt/homebrew/bin/expect'
        ];
        
        // Check if any of the common paths exist
        for (const p of commonPaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        
        // Try to find it using the which command
        return new Promise((resolve) => {
            const whichProcess = spawn('which', ['expect']);
            let output = '';
            
            whichProcess.stdout.on('data', (data) => {
                output += data.toString().trim();
            });
            
            whichProcess.on('close', (code) => {
                if (code === 0 && output) {
                    resolve(output);
                } else {
                    resolve(null);
                }
            });
            
            whichProcess.on('error', () => {
                resolve(null);
            });
        });
    } catch (err) {
        console.error('Error finding expect:', err);
        return null;
    }
}

// Rename a file or directory on a remote server
router.post('/rename', async (req, res) => {
    try {
        const { serverId, oldPath, newPath, isDirectory } = req.body;
        
        if (!serverId || !oldPath || !newPath) {
            return res.status(400).json({ 
                success: false, 
                message: 'Server ID, old path, and new path are required' 
            });
        }

        // Get server details from database
        const Server = require('../models/Server');
        const server = await Server.findById(serverId);
        
        if (!server) {
            return res.status(404).json({ 
                success: false, 
                message: 'Server not found' 
            });
        }
        
        // Determine if we need to use an identity
        let sshArgs = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes'
        ];
        
        // If the server has an identity, fetch it
        if (server.identityId) {
            const Identity = require('../models/Identity');
            try {
                const identity = await Identity.findById(server.identityId);
                if (identity) {
                    // Use identity details
                    if (identity.authType === 'key' && identity.privateKey) {
                        // Check if the privateKey is a reference to a key file
                        if (identity.privateKey.startsWith('file:')) {
                            const keyId = identity.privateKey.replace('file:', '');
                            const keyFileName = path.join(__dirname, '..', 'keys', `key-${keyId}`);
                            
                            try {
                                // Check if the key file exists
                                if (!fs.existsSync(keyFileName)) {
                                    throw new Error(`SSH key file not found: ${keyFileName}`);
                                }
                                
                                console.log(`Using key file: ${keyFileName}`);
                                sshArgs.push('-i', keyFileName);
                            } catch (err) {
                                console.error('Failed to use key file:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    message: 'Failed to use SSH key file: ' + err.message 
                                });
                            }
                        } else {
                            // Handle key authentication with the identity's key text
                            const keyFileName = path.join(downloadTempDir, `key-${crypto.randomBytes(8).toString('hex')}`);
                            
                            // Make sure the key has correct line endings
                            const formattedKey = identity.privateKey.trim().replace(/\r\n/g, '\n');
                            
                            // Ensure each line is properly formatted
                            const cleanedKey = formattedKey
                                .split('\n')
                                .map(line => line.trim())
                                .join('\n');
                            
                            // Write the key with strict permissions
                            fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                            console.log(`Key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                            
                            sshArgs.push('-i', keyFileName);
                            
                            // Clean up key file when done
                            res.on('finish', () => {
                                try { fs.unlinkSync(keyFileName); } catch(e) { /* ignore */ }
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading identity:', err);
                // Fall back to server credentials
            }
        }
        
        // If we get here, either no identity was found or we're using a key from the identity
        // Use server credentials
        const username = server.username;
        const host = server.host;
        const port = server.port || 22;
        
        // Add port to SSH args
        sshArgs.push('-p', port.toString());
        
        // Add the target server info
        sshArgs.push(`${username}@${host}`);
        
        // Use the mv command to rename the file or directory
        const command = `mv "${oldPath}" "${newPath}"`;
        
        // Add the rename command
        sshArgs.push(command);
        
        // Spawn the SSH process
        console.log('Running SSH command with args:', sshArgs.join(' '));
        const sshProcess = spawn('ssh', sshArgs);
        
        // Handle errors
        let errorOutput = '';
        sshProcess.stderr.on('data', (data) => {
            const errorText = data.toString();
            errorOutput += errorText;
            console.error('SSH stderr output:', errorText);
        });
        
        sshProcess.on('error', (error) => {
            console.error('SSH process error:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'SSH process error: ' + error.message 
            });
        });
        
        sshProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('SSH process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'SSH process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Get the new file/directory name for the response
            const newName = path.basename(newPath);
            
            // Return success response
            res.status(200).json({ 
                success: true,
                message: isDirectory ? 'Directory renamed successfully' : 'File renamed successfully',
                oldPath: oldPath,
                newPath: newPath,
                newName: newName
            });
        });
        
    } catch (error) {
        console.error('File rename error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error: ' + error.message 
        });
    }
});

// Save content to a file on a remote server
router.post('/save', async (req, res) => {
    try {
        const { serverId, filePath, content } = req.body;
        
        if (!serverId || !filePath || content === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Server ID, file path, and content are required' 
            });
        }

        // Get server details from database
        const Server = require('../models/Server');
        const server = await Server.findById(serverId);
        
        if (!server) {
            return res.status(404).json({ 
                success: false, 
                message: 'Server not found' 
            });
        }
        
        // Create a temporary file to hold the content
        const tempFileName = path.join(tempDir, `${crypto.randomBytes(8).toString('hex')}-content`);
        
        // Write the content to the temp file
        fs.writeFileSync(tempFileName, content, 'utf8');
        
        // Determine if we need to use an identity
        let sshArgs = [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'BatchMode=yes'
        ];
        
        // If the server has an identity, fetch it (same code as in other routes)
        if (server.identityId) {
            const Identity = require('../models/Identity');
            try {
                const identity = await Identity.findById(server.identityId);
                if (identity) {
                    // Use identity details
                    if (identity.authType === 'key' && identity.privateKey) {
                        // Check if the privateKey is a reference to a key file
                        if (identity.privateKey.startsWith('file:')) {
                            const keyId = identity.privateKey.replace('file:', '');
                            const keyFileName = path.join(__dirname, '..', 'keys', `key-${keyId}`);
                            
                            try {
                                // Check if the key file exists
                                if (!fs.existsSync(keyFileName)) {
                                    throw new Error(`SSH key file not found: ${keyFileName}`);
                                }
                                
                                console.log(`Using key file: ${keyFileName}`);
                                sshArgs.push('-i', keyFileName);
                            } catch (err) {
                                console.error('Failed to use key file:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    message: 'Failed to use SSH key file: ' + err.message 
                                });
                            }
                        } else {
                            // Handle key authentication with the identity's key text
                            const keyFileName = path.join(downloadTempDir, `key-${crypto.randomBytes(8).toString('hex')}`);
                            
                            // Make sure the key has correct line endings
                            const formattedKey = identity.privateKey.trim().replace(/\r\n/g, '\n');
                            
                            // Ensure each line is properly formatted
                            const cleanedKey = formattedKey
                                .split('\n')
                                .map(line => line.trim())
                                .join('\n');
                            
                            // Write the key with strict permissions
                            fs.writeFileSync(keyFileName, cleanedKey, { mode: 0o600 });
                            console.log(`Key file written successfully. Size: ${fs.statSync(keyFileName).size} bytes`);
                            
                            sshArgs.push('-i', keyFileName);
                            
                            // Clean up key file when done
                            res.on('finish', () => {
                                try { fs.unlinkSync(keyFileName); } catch(e) { /* ignore */ }
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('Error loading identity:', err);
                // Fall back to server credentials
            }
        }
        
        // If we get here, either no identity was found or we're using a key from the identity
        // Use server credentials
        const username = server.username;
        const host = server.host;
        const port = server.port || 22;
        
        // Add port to SSH args
        sshArgs.push('-p', port.toString());
        
        // Use SCP to copy the temp file to the remote path
        sshArgs = ['-o', 'StrictHostKeyChecking=no', '-P', port.toString()];
        
        if (sshArgs.includes('-i')) {
            // Copy the identity parameter if it exists
            const iIndex = sshArgs.indexOf('-i');
            sshArgs.push('-i', sshArgs[iIndex + 1]);
        }
        
        // Execute SCP to upload the file content
        const scpProcess = spawn('scp', [...sshArgs, tempFileName, `${username}@${host}:${filePath}`]);
        
        console.log(`Executing SCP to save content to ${username}@${host}:${filePath}`);
        
        // Handle errors
        let errorOutput = '';
        scpProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('SCP stderr output:', data.toString());
        });
        
        scpProcess.on('error', (error) => {
            console.error('SCP process error:', error);
            // Clean up temp file
            try { fs.unlinkSync(tempFileName); } catch(e) { /* ignore */ }
            return res.status(500).json({ 
                success: false, 
                message: 'SCP process error: ' + error.message 
            });
        });
        
        scpProcess.on('close', (code) => {
            // Clean up temp file after uploading
            try { fs.unlinkSync(tempFileName); } catch(e) { /* ignore */ }
            
            if (code !== 0) {
                console.error('SCP process exited with code:', code);
                console.error('Error output:', errorOutput);
                
                return res.status(500).json({ 
                    success: false, 
                    message: 'SCP process exited with code ' + code + ': ' + errorOutput
                });
            }
            
            // Return success response
            res.status(200).json({ 
                success: true,
                message: 'File saved successfully',
                path: filePath
            });
        });
        
    } catch (error) {
        console.error('File save error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error: ' + error.message 
        });
    }
});

// Export the router and the helper functions
module.exports = router;
module.exports.getSshpassPath = getSshpassPath;
module.exports.getExpectPath = getExpectPath; 