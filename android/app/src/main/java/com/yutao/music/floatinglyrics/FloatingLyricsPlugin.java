package com.yutao.music.floatinglyrics;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges the shared `FloatingLyricsBridge` TypeScript interface to the Android
 * overlay. Kept deliberately thin: all rendering lives in the service.
 */
@CapacitorPlugin(name = "FloatingLyrics")
public class FloatingLyricsPlugin extends Plugin {

    @Override
    public void load() {
        FloatingLyricsService.setCommandListener(command -> {
            JSObject payload = new JSObject();
            payload.put("command", command);
            notifyListeners("command", payload);
        });
    }

    @Override
    protected void handleOnDestroy() {
        FloatingLyricsService.setCommandListener(null);
        super.handleOnDestroy();
    }

    private boolean canDrawOverlays() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(getContext());
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", canDrawOverlays());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (canDrawOverlays()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName())
        );
        startActivityForResult(call, intent, "overlayPermissionResult");
    }

    @ActivityCallback
    private void overlayPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject payload = new JSObject();
        // The settings screen never reports a result code, so re-check the state.
        payload.put("granted", canDrawOverlays());
        call.resolve(payload);
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (!canDrawOverlays()) {
            call.reject("OVERLAY_PERMISSION_DENIED");
            return;
        }
        Intent intent = new Intent(getContext(), FloatingLyricsService.class);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        getContext().stopService(new Intent(getContext(), FloatingLyricsService.class));
        call.resolve();
    }

    @PluginMethod
    public void isVisible(PluginCall call) {
        JSObject result = new JSObject();
        result.put("visible", FloatingLyricsService.isRunning());
        call.resolve(result);
    }

    @PluginMethod
    public void update(PluginCall call) {
        LyricsState.title = call.getString("title", "");
        LyricsState.artist = call.getString("artist", "");
        LyricsState.line = call.getString("line", "");
        LyricsState.translation = call.getString("translation", "");
        LyricsState.nextLine = call.getString("nextLine", "");
        LyricsState.isPlaying = Boolean.TRUE.equals(call.getBoolean("isPlaying", false));
        LyricsState.currentTime = call.getDouble("currentTime", 0d);
        LyricsState.duration = call.getDouble("duration", 0d);
        FloatingLyricsService.refresh();
        call.resolve();
    }

    @PluginMethod
    public void setStyle(PluginCall call) {
        LyricsState.fontSize = call.getInt("fontSize", 28);
        LyricsState.color = call.getString("color", "#FFFFFF");
        LyricsState.activeColor = call.getString("activeColor", "#4EA1FF");
        LyricsState.background = call.getString("background", "rgba(0,0,0,0.35)");
        LyricsState.bold = Boolean.TRUE.equals(call.getBoolean("bold", true));
        LyricsState.showTranslation = Boolean.TRUE.equals(call.getBoolean("showTranslation", true));
        LyricsState.locked = Boolean.TRUE.equals(call.getBoolean("locked", false));
        LyricsState.opacity = call.getDouble("opacity", 1d);
        FloatingLyricsService.refresh();
        call.resolve();
    }
}
