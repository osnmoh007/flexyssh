const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

/**
 * Authentication middleware
 * Checks if the user is authenticated via session
 */
const isAuthenticated = (req, res, next) => {
    // Check if the user is authenticated
    if (req.session && req.session.authenticated) {
        return next();
    }
    
    // Redirect to login if not authenticated
    return res.redirect('/login');
};

/**
 * Validates the admin username and password against values in .env
 * @param {string} username - The username to validate
 * @param {string} password - The password to validate
 * @returns {boolean} True if the credentials match
 */
const validateCredentials = (username, password) => {
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminUsername || !adminPassword) {
        console.error('ADMIN_USERNAME or ADMIN_PASSWORD not set in environment variables');
        return false;
    }
    
    return username === adminUsername && password === adminPassword;
};

module.exports = {
    isAuthenticated,
    validateCredentials
}; 