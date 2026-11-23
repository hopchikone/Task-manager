package com.arena.zadaniya;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Calendar;

/**
 * Хранилище состояния в файле приложения и планирование настоящих системных
 * напоминаний через AlarmManager (работают, даже когда приложение закрыто).
 */
public class NativeStore {

    private static final String FILE_NAME = "data.json";

    public static File file(Context ctx) {
        return new File(ctx.getFilesDir(), FILE_NAME);
    }

    public static String read(Context ctx) {
        try {
            File f = file(ctx);
            if (!f.exists()) return "";
            byte[] bytes = Files.readAllBytes(f.toPath());
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            Log.w("Zadaniya", "read failed", e);
            return "";
        }
    }

    public static void write(Context ctx, String json) {
        try {
            FileOutputStream out = new FileOutputStream(file(ctx));
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.close();
        } catch (Exception e) {
            Log.w("Zadaniya", "write failed", e);
        }
    }

    /* ---------------- напоминания ---------------- */

    /** Пересчитать и запланировать все напоминания по состоянию приложения. */
    public static void scheduleReminders(Context ctx, String stateJson) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        cancelAll(ctx);
        ensureChannel(ctx);

        String json = stateJson;
        if (json == null || json.isEmpty()) json = read(ctx);
        if (json.isEmpty()) return;

        try {
            JSONObject root = new JSONObject(json);
            JSONObject settings = root.optJSONObject("settings");
            boolean enabled = settings != null && settings.optBoolean("notify", false);
            if (!enabled) return;

            String time = settings.optString("time", "09:00");
            int before = settings.optInt("before", 1);
            int hour = 9, minute = 0;
            String[] parts = time.split(":");
            if (parts.length == 2) {
                hour = Integer.parseInt(parts[0].trim());
                minute = Integer.parseInt(parts[1].trim());
            }

            JSONArray tasks = root.optJSONArray("tasks");
            if (tasks == null) return;

            long now = System.currentTimeMillis();
            int scheduled = 0;
            StringBuilder usedCodes = new StringBuilder();

            for (int i = 0; i < tasks.length() && scheduled < 60; i++) {
                JSONObject t = tasks.optJSONObject(i);
                if (t == null) continue;
                if (t.optBoolean("done", false)) continue;
                String date = t.optString("date", "");
                if (date.length() < 10) continue;

                Calendar cal = Calendar.getInstance();
                String[] d = date.substring(0, 10).split("-");
                cal.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1, Integer.parseInt(d[2]));
                cal.add(Calendar.DAY_OF_MONTH, -before);
                cal.set(Calendar.HOUR_OF_DAY, hour);
                cal.set(Calendar.MINUTE, minute);
                cal.set(Calendar.SECOND, 0);
                cal.set(Calendar.MILLISECOND, 0);

                long trigger = cal.getTimeInMillis();
                if (trigger <= now) {
                    // время уже прошло, но задание ещё не выполнено — напомним через минуту
                    if (trigger > now - 3L * 24 * 60 * 60 * 1000) trigger = now + 60_000L;
                    else continue;
                }

                String subject = t.optString("subject", "");
                String title = t.optString("title", "Задание");
                String body = (subject.isEmpty() ? "" : subject + ": ") + title + " — сдать " + humanDate(date);

                Intent intent = new Intent(ctx, ReminderReceiver.class);
                intent.putExtra("title", "Скоро дедлайн");
                intent.putExtra("body", body);
                int requestCode = Math.abs((t.optString("id", "") + date).hashCode() % 100000);

                PendingIntent pi = PendingIntent.getBroadcast(
                        ctx, requestCode, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
                    } else {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
                    }
                    scheduled++;
                    if (usedCodes.length() > 0) usedCodes.append(',');
                    usedCodes.append(requestCode);
                } catch (SecurityException se) {
                    Log.w("Zadaniya", "exact alarm denied", se);
                }
            }
            Log.i("Zadaniya", "напоминаний запланировано: " + scheduled);
            android.content.SharedPreferences sp = ctx.getSharedPreferences("zadaniya", Context.MODE_PRIVATE);
            // запоминаем, чтобы в следующий раз отменить именно эти будильники
            sp.edit().putString("state", json).putString("alarmKeys", usedCodes.toString()).apply();
        } catch (Exception e) {
            Log.w("Zadaniya", "schedule failed", e);
        }
    }

    /** Перепланировать после перезагрузки телефона. */
    public static void rescheduleFromPrefs(Context ctx) {
        android.content.SharedPreferences sp = ctx.getSharedPreferences("zadaniya", Context.MODE_PRIVATE);
        String json = sp.getString("state", null);
        if (json == null) json = read(ctx);
        if (json != null && !json.isEmpty()) scheduleReminders(ctx, json);
    }

    /** Канал уведомлений создаётся один раз: важность нельзя поменять позже. */
    public static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        android.app.NotificationManager nm =
                (android.app.NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        android.app.NotificationChannel ch = new android.app.NotificationChannel(
                ReminderReceiver.CHANNEL_ID, "Дедлайны", android.app.NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Напоминания о сроках сдачи заданий");
        ch.enableVibration(true);
        ch.setShowBadge(true);
        nm.createNotificationChannel(ch);
    }

    private static void cancelAll(Context ctx) {
        // точные PendingIntent'ы неизвестны — отменяем через сохранённые ключи
        android.content.SharedPreferences sp = ctx.getSharedPreferences("zadaniya", Context.MODE_PRIVATE);
        String keys = sp.getString("alarmKeys", "");
        if (keys == null || keys.isEmpty()) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (String k : keys.split(",")) {
            try {
                int rc = Integer.parseInt(k.trim());
                Intent intent = new Intent(ctx, ReminderReceiver.class);
                PendingIntent pi = PendingIntent.getBroadcast(ctx, rc, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.cancel(pi);
            } catch (Exception ignored) { }
        }
        sp.edit().putString("alarmKeys", "").apply();
    }

    static String humanDate(String isoDate) {
        try {
            String[] d = isoDate.substring(0, 10).split("-");
            String[] months = {"января", "февраля", "марта", "апреля", "мая", "июня", "июля",
                    "августа", "сентября", "октября", "ноября", "декабря"};
            return Integer.parseInt(d[2]) + " " + months[Integer.parseInt(d[1]) - 1];
        } catch (Exception e) {
            return isoDate;
        }
    }

    public static boolean notificationsAllowed(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    public static void requestNotificationPermission(Activity a) {
        if (Build.VERSION.SDK_INT >= 33 && !notificationsAllowed(a)) {
            a.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 101);
        }
    }

    public static void openExactAlarmSettings(Activity a) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                AlarmManager am = (AlarmManager) a.getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms()) {
                    Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                    i.setData(Uri.parse("package:" + a.getPackageName()));
                    a.startActivity(i);
                }
            } catch (Exception ignored) { }
        }
    }
}
