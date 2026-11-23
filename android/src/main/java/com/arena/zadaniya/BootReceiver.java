package com.arena.zadaniya;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** После перезагрузки телефона напоминания планируются заново. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        try {
            NativeStore.rescheduleFromPrefs(ctx);
        } catch (Exception ignored) { }
    }
}
