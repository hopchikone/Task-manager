package com.arena.zadaniya;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Показывает системное уведомление о дедлайне. */
public class ReminderReceiver extends BroadcastReceiver {

    public static final String CHANNEL_ID = "deadlines";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        NativeStore.ensureChannel(ctx);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        if (title == null) title = "Скоро дедлайн";
        if (body == null) body = "Проверьте задания в дневнике";

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Дедлайны", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Напоминания о сроках сдачи заданий");
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
                ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        int icon = R.mipmap.ic_stat;
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(ctx, CHANNEL_ID)
                : new Notification.Builder(ctx);

        b.setSmallIcon(icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setShowWhen(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            b.setColor(0xFF7C8CFF);
        }

        try {
            nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
        } catch (SecurityException ignored) { }
    }
}
