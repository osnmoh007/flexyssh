#!/bin/bash

# Define version or extract from package.json if available
VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null)

if [ -z "$VERSION" ]; then
    # Default version if not found in package.json
    VERSION="1.0.0"
    echo "Warning: Using default version $VERSION"
else
    echo "Found version $VERSION in package.json"
fi

# Set image name and platforms
# Update with your Docker Hub username
REGISTRY="mohfreestyl"
IMAGE_NAME="${REGISTRY}/flexyssh"
PLATFORMS="linux/amd64,linux/arm64"

echo "Building Docker image: $IMAGE_NAME:$VERSION"
echo "Platforms: $PLATFORMS"

# Create and use a new builder instance if it doesn't exist
if ! docker buildx inspect mybuilder >/dev/null 2>&1; then
    echo "Creating new builder instance..."
    docker buildx create --name mybuilder --driver docker-container --bootstrap
    docker buildx use mybuilder
fi

# Build and push the Docker image using buildx
docker buildx build \
    --platform ${PLATFORMS} \
    --tag "${IMAGE_NAME}:${VERSION}" \
    --tag "${IMAGE_NAME}:latest" \
    --cache-from "type=local,src=/tmp/.buildx-cache" \
    --cache-to "type=local,dest=/tmp/.buildx-cache-new,mode=max" \
    --push \
    .

# Handle build result
if [ $? -eq 0 ]; then
    echo "Successfully built and pushed $IMAGE_NAME:$VERSION"
    echo "Also tagged and pushed as $IMAGE_NAME:latest"
    
    # Move cache
    rm -rf /tmp/.buildx-cache
    mv /tmp/.buildx-cache-new /tmp/.buildx-cache
else
    echo "Error: Failed to build Docker image"
    exit 1
fi 