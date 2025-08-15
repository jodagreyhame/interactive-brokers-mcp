#!/bin/bash

set -e

echo "🔧 Building custom Java runtimes for all platforms..."

# Essential modules for IB Gateway
MODULES="java.base,java.logging,java.net.http,java.desktop,java.management,java.naming,java.security.jgss,java.sql,java.xml,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.zipfs"

# Function to build runtime for a specific platform
build_platform_runtime() {
    local platform="$1"
    local jdk_url="$2"
    local jlink_path="$3"
    local extract_cmd="$4"
    
    echo ""
    echo "🏗️  Building runtime for $platform..."
    
    # Create platform-specific temp dir
    local temp_dir="./temp-$platform"
    mkdir -p "$temp_dir"
    
    # Download JDK
    local archive_name=$(basename "$jdk_url" | cut -d'%' -f1)
    local archive_path="$temp_dir/$archive_name"
    
    echo "⬇️  Downloading JDK for $platform..."
    curl -L -o "$archive_path" "$jdk_url"
    
    # Extract JDK
    echo "📦 Extracting JDK..."
    if [[ "$extract_cmd" == "unzip" ]]; then
        unzip -q "$archive_path" -d "$temp_dir"
    else
        tar -xf "$archive_path" -C "$temp_dir"
    fi
    
    # Build custom runtime
    local jlink_full_path="$temp_dir/$jlink_path"
    local runtime_output="./runtime/$platform"
    
    echo "🔗 Running jlink for $platform..."
    mkdir -p "./runtime"
    
    "$jlink_full_path" \
        --add-modules "$MODULES" \
        --strip-debug \
        --no-man-pages \
        --no-header-files \
        --compress=2 \
        --output "$runtime_output"
    
    # Test the runtime
    local java_exe="java"
    if [[ "$platform" == "win32-x64" ]]; then
        java_exe="java.exe"
    fi
    
    echo "✅ Testing $platform runtime..."
    "$runtime_output/bin/$java_exe" -version
    
    # Show size
    local size=$(du -sh "$runtime_output" | cut -f1)
    echo "📏 $platform runtime size: $size"
    
    # Clean up temp files
    rm -rf "$temp_dir"
    
    echo "✅ $platform runtime complete!"
}

# Build for all platforms
echo "Building runtimes for all supported platforms..."

# macOS ARM64
build_platform_runtime "darwin-arm64" \
    "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.22%2B7/OpenJDK11U-jdk_aarch64_mac_hotspot_11.0.22_7.tar.gz" \
    "jdk-11.0.22+7/Contents/Home/bin/jlink" \
    "tar"

# macOS x64
build_platform_runtime "darwin-x64" \
    "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.22%2B7/OpenJDK11U-jdk_x64_mac_hotspot_11.0.22_7.tar.gz" \
    "jdk-11.0.22+7/Contents/Home/bin/jlink" \
    "tar"

# Linux x64
build_platform_runtime "linux-x64" \
    "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.22%2B7/OpenJDK11U-jdk_x64_linux_hotspot_11.0.22_7.tar.gz" \
    "jdk-11.0.22+7/bin/jlink" \
    "tar"

# Windows x64 (this might not work on non-Windows, but we'll try)
if command -v unzip &> /dev/null; then
    build_platform_runtime "win32-x64" \
        "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.22%2B7/OpenJDK11U-jdk_x64_windows_hotspot_11.0.22_7.zip" \
        "jdk-11.0.22+7/bin/jlink.exe" \
        "unzip"
else
    echo "⚠️  Skipping Windows runtime (unzip not available)"
fi

echo ""
echo "🎉 Runtime building complete!"
echo "📁 Runtimes are in: ./runtime/"
echo ""
echo "Runtime sizes:"
du -sh ./runtime/* 2>/dev/null || echo "No runtimes found"
