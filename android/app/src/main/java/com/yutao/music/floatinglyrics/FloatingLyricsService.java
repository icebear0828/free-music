package com.yutao.music.floatinglyrics;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.yutao.music.MainActivity;
import com.yutao.music.R;

/**
 * Foreground service owning the SYSTEM_ALERT_WINDOW overlay.
 *
 * A foreground service (rather than a bare overlay) is what keeps the overlay
 * alive once the app is backgrounded — Android otherwise reclaims the process
 * and the lyrics disappear the moment the user switches apps.
 */
public class FloatingLyricsService extends Service {

    public interface CommandListener {
        void onCommand(String command);
    }

    private static final String CHANNEL_ID = "floating_lyrics";
    private static final int NOTIFICATION_ID = 4711;

    private static FloatingLyricsService instance;
    private static CommandListener commandListener;

    private final Handler main = new Handler(Looper.getMainLooper());

    private WindowManager windowManager;
    private View root;
    private WindowManager.LayoutParams params;

    private LinearLayout container;
    private TextView metaView;
    private TextView lineView;
    private TextView translationView;
    private TextView nextView;
    private View toolbar;
    private ImageButton playButton;

    private boolean toolbarVisible = false;

    public static boolean isRunning() {
        return instance != null;
    }

    public static void setCommandListener(CommandListener listener) {
        commandListener = listener;
    }

    /** Re-renders the overlay from {@link LyricsState}; a no-op when hidden. */
    public static void refresh() {
        FloatingLyricsService service = instance;
        if (service != null) service.main.post(service::render);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        startForegroundNotification();
        addOverlay();
        render();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        render();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (root != null && windowManager != null) {
            try {
                windowManager.removeView(root);
            } catch (IllegalArgumentException ignored) {
                // Already detached.
            }
        }
        root = null;
        instance = null;
        super.onDestroy();
    }

    private void startForegroundNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "桌面歌词",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("桌面歌词已开启")
            .setContentText("点击返回 Music")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pending)
            .setOngoing(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void addOverlay() {
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        root = LayoutInflater.from(this).inflate(R.layout.floating_lyrics, null);

        container = root.findViewById(R.id.lyrics_container);
        metaView = root.findViewById(R.id.lyrics_meta);
        lineView = root.findViewById(R.id.lyrics_line);
        translationView = root.findViewById(R.id.lyrics_translation);
        nextView = root.findViewById(R.id.lyrics_next);
        toolbar = root.findViewById(R.id.lyrics_toolbar);
        playButton = root.findViewById(R.id.lyrics_play);

        root.findViewById(R.id.lyrics_prev).setOnClickListener(v -> emit("prev"));
        playButton.setOnClickListener(v -> emit(LyricsState.isPlaying ? "pause" : "play"));
        root.findViewById(R.id.lyrics_next_btn).setOnClickListener(v -> emit("next"));
        root.findViewById(R.id.lyrics_lock).setOnClickListener(v -> emit(LyricsState.locked ? "unlock" : "lock"));
        root.findViewById(R.id.lyrics_close).setOnClickListener(v -> emit("close"));

        params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE,
            overlayFlags(),
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.y = dp(120);

        container.setOnTouchListener(new DragListener());
        container.setOnClickListener(v -> toggleToolbar());

        windowManager.addView(root, params);
    }

    private int overlayFlags() {
        int flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
        if (LyricsState.locked) {
            flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        }
        return flags;
    }

    private void toggleToolbar() {
        toolbarVisible = !toolbarVisible;
        toolbar.setVisibility(toolbarVisible ? View.VISIBLE : View.GONE);
        metaView.setVisibility(toolbarVisible && !LyricsState.title.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void emit(String command) {
        CommandListener listener = commandListener;
        if (listener != null) listener.onCommand(command);
    }

    private void render() {
        if (root == null) return;

        metaView.setText(LyricsState.title.isEmpty() ? "" : LyricsState.title + " — " + LyricsState.artist);
        lineView.setText(LyricsState.line.isEmpty() ? "♪" : LyricsState.line);

        boolean showTranslation = LyricsState.showTranslation && !LyricsState.translation.isEmpty();
        translationView.setVisibility(showTranslation ? View.VISIBLE : View.GONE);
        translationView.setText(LyricsState.translation);

        nextView.setVisibility(LyricsState.nextLine.isEmpty() ? View.GONE : View.VISIBLE);
        nextView.setText(LyricsState.nextLine);

        int activeColor = ColorUtils.parse(LyricsState.activeColor, 0xFF4EA1FF);
        int textColor = ColorUtils.parse(LyricsState.color, 0xFFFFFFFF);

        lineView.setTextColor(activeColor);
        lineView.setTextSize(TypedValue.COMPLEX_UNIT_SP, (float) LyricsState.fontSize);
        lineView.setTypeface(null, LyricsState.bold ? Typeface.BOLD : Typeface.NORMAL);

        translationView.setTextColor(textColor);
        translationView.setTextSize(TypedValue.COMPLEX_UNIT_SP, (float) LyricsState.fontSize * 0.62f);
        nextView.setTextColor(textColor);
        nextView.setTextSize(TypedValue.COMPLEX_UNIT_SP, (float) LyricsState.fontSize * 0.52f);
        metaView.setTextColor(textColor);

        GradientDrawable background = new GradientDrawable();
        background.setCornerRadius(dp(16));
        background.setColor(ColorUtils.parse(LyricsState.background, 0x59000000));
        container.setBackground(background);
        container.setAlpha((float) LyricsState.opacity);

        playButton.setImageResource(
            LyricsState.isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play
        );

        int flags = overlayFlags();
        if (params.flags != flags) {
            params.flags = flags;
            if (LyricsState.locked) {
                toolbarVisible = false;
                toolbar.setVisibility(View.GONE);
                metaView.setVisibility(View.GONE);
            }
            windowManager.updateViewLayout(root, params);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /** Vertical drag to reposition; horizontal stays full-width like other lyric apps. */
    private class DragListener implements View.OnTouchListener {

        private int startY;
        private float touchY;
        private boolean moved;

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    startY = params.y;
                    touchY = event.getRawY();
                    moved = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    int delta = Math.round(event.getRawY() - touchY);
                    if (Math.abs(delta) > dp(4)) moved = true;
                    params.y = Math.max(0, startY + delta);
                    windowManager.updateViewLayout(root, params);
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!moved) view.performClick();
                    return true;
                default:
                    return false;
            }
        }
    }
}
