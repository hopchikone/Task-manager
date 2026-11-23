#!/bin/bash
set -e
cd /home/user/android-build
mkdir -p sdk tools
# JDK 17 (нужен для sdkmanager/AGP)
if [ ! -d tools/jdk17 ]; then
  curl -sL -o jdk17.tar.gz "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p tools/jdk17 && tar xzf jdk17.tar.gz -C tools/jdk17 --strip-components=1 && rm jdk17.tar.gz
fi
export JAVA_HOME=/home/user/android-build/tools/jdk17
export PATH=$JAVA_HOME/bin:$PATH
java -version 2>&1 | head -2

# Android command line tools
if [ ! -d sdk/cmdline-tools/latest ]; then
  curl -sL -o cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  mkdir -p sdk/cmdline-tools && unzip -q cmdtools.zip -d sdk/cmdline-tools && mv sdk/cmdline-tools/cmdline-tools sdk/cmdline-tools/latest && rm cmdtools.zip
fi
export ANDROID_HOME=/home/user/android-build/sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH

yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" 2>&1 | tail -5
echo "=== ГОТОВО ==="
ls sdk/build-tools/34.0.0 | head -20
