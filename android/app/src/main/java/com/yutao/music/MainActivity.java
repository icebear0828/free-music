package com.yutao.music;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.yutao.music.floatinglyrics.FloatingLyricsPlugin;

public class MainActivity extends BridgeActivity {

    private static final int REQUEST_NOTIFICATIONS = 9001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins are not auto-discovered; register before the bridge boots.
        registerPlugin(FloatingLyricsPlugin.class);
        super.onCreate(savedInstanceState);
        requestNotificationPermission();
    }

    /** The floating lyrics foreground service needs a visible notification on Android 13+. */
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        boolean granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
        if (!granted) {
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                REQUEST_NOTIFICATIONS
            );
        }
    }
}
