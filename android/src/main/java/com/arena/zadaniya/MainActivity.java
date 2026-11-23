package com.arena.zadaniya;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** Контейнер: WebView с приложением внутри + мост к нативным напоминаниям. */
public class MainActivity extends Activity {

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF0B0E14);
            getWindow().setNavigationBarColor(0xFF0B0E14);
        }

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(0xFF0B0E14);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(false);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        web.addJavascriptInterface(new Bridge(), "NativeApp");
        web.setWebViewClient(new WebViewClient());
        web.loadUrl("file:///android_asset/www/index.html");

        setContentView(web);

        NativeStore.ensureChannel(this);
        NativeStore.requestNotificationPermission(this);
        NativeStore.openExactAlarmSettings(this);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // состояние уже сохранено мостом saveState() при каждом изменении
    }

    /** Мост JS ↔ Android */
    private class Bridge {

        @JavascriptInterface
        public boolean isNative() { return true; }

        @JavascriptInterface
        public void saveState(String json) {
            if (json == null) return;
            NativeStore.write(MainActivity.this, json);
            getSharedPreferences("zadaniya", MODE_PRIVATE).edit().putString("state", json).apply();
        }

        @JavascriptInterface
        public String loadState() {
            String fromFile = NativeStore.read(MainActivity.this);
            if (fromFile != null && !fromFile.isEmpty()) return fromFile;
            return getSharedPreferences("zadaniya", MODE_PRIVATE).getString("state", "");
        }

        @JavascriptInterface
        public void scheduleReminders(String json) {
            NativeStore.scheduleReminders(MainActivity.this, json);
        }

        @JavascriptInterface
        public void testNotification() {
            Intent i = new Intent(MainActivity.this, ReminderReceiver.class);
            i.putExtra("title", "Проверка уведомлений");
            i.putExtra("body", "Так будет выглядеть напоминание о дедлайне — работает даже при закрытом приложении.");
            sendBroadcast(i);
        }

        @JavascriptInterface
        public void requestPermissions() {
            runOnUiThread(() -> {
                NativeStore.requestNotificationPermission(MainActivity.this);
                NativeStore.openExactAlarmSettings(MainActivity.this);
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public String appVersion() { return "1.0"; }
    }
}
