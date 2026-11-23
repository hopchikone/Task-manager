#!/bin/bash
set -e
cd /home/user/android-build
export JAVA_HOME=/home/user/android-build/tools/jdk17
export PATH=$JAVA_HOME/bin:$PATH
export ANDROID_HOME=/home/user/android-build/sdk

# Gradle 8.7
if [ ! -d tools/gradle-8.7 ]; then
  curl -sL -o gradle.zip https://services.gradle.org/distributions/gradle-8.7-bin.zip
  unzip -q gradle.zip -d tools && rm gradle.zip
fi
export PATH=/home/user/android-build/tools/gradle-8.7/bin:$PATH

# ключ подписи
if [ ! -f keystore.jks ]; then
  keytool -genkeypair -v -keystore keystore.jks -alias zadaniya -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass zadaniya123 -keypass zadaniya123 \
    -dname "CN=Zadaniya, OU=Study, O=Arena, L=Helsinki, C=FI" > /dev/null 2>&1
fi

# свежие веб-файлы внутрь приложения
cp /home/user/study-planner/index.html /home/user/study-planner/style.css /home/user/study-planner/app.js \
   src/main/assets/www/

gradle assembleRelease --no-daemon --console=plain 2>&1 | tail -40
echo "=== APK ==="
find build/outputs -name "*.apk" -exec ls -la {} \;
