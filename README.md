# FlexySSH

A web-based SSH client with folder organization for servers.

## Features

- Web-based SSH terminal
- Server management with folders for organization
- SSH identity management
- Authentication system to protect your SSH connections

## Installation

1. Clone the repository
2. Install dependencies

```bash
npm install
```

3. Create a `.env` file in the root directory with the following content:

```
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/flexyssh

# Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=your_random_session_secret

# Application settings
PORT=3000
NODE_ENV=development
```

4. Start the application

```bash
npm start
```

## Authentication Setup

The application now has a login system to protect your SSH connections. To configure authentication:

1. Set the `ADMIN_USERNAME` and `ADMIN_PASSWORD` in your `.env` file
2. Set a strong `SESSION_SECRET` to secure the session cookies
3. Navigate to the application URL and log in with your configured credentials

For production deployments, make sure to:
- Use HTTPS for secure connections
- Set NODE_ENV=production for secure cookies
- Use a strong, random SESSION_SECRET value
- Store the .env file securely and restrict access

## Docker Deployment

You can also run FlexySSH in a Docker container:

### Build and run locally

```bash
# Build the Docker image
docker build -t flexyssh .

# Run the container
docker run -p 3000:3000 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/flexyssh \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=your_secure_password \
  -e SESSION_SECRET=your_random_session_secret \
  -v flexyssh-keys:/usr/src/app/keys \
  flexyssh
```

### Using the build script

1. Edit `build.sh` to set your Docker Hub username
2. Make the script executable and run it:

```bash
chmod +x build.sh
./build.sh
```

This will build a multi-architecture Docker image and push it to Docker Hub.

### Production deployment with Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3'
services:
  mongodb:
    image: mongo:latest
    volumes:
      - mongodb_data:/data/db
    restart: always

  flexyssh:
    image: yourusername/flexyssh:latest
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/flexyssh
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=your_secure_password
      - SESSION_SECRET=your_random_session_secret
      - NODE_ENV=production
    ports:
      - "3000:3000"
    volumes:
      - flexyssh_keys:/usr/src/app/keys
    depends_on:
      - mongodb
    restart: always

volumes:
  mongodb_data:
  flexyssh_keys:
```

Run with:

```bash
docker-compose up -d
```

## License

MIT 