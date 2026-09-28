package com.yutao.music.floatinglyrics;

/**
 * Last snapshot and style pushed from the WebView. Held statically so the
 * overlay service can render immediately after it starts, even if the JS layer
 * pushed content before the service was up.
 */
public final class LyricsState {

    public static String title = "";
    public static String artist = "";
    public static String line = "";
    public static String translation = "";
    public static String nextLine = "";
    public static boolean isPlaying = false;
    public static double currentTime = 0;
    public static double duration = 0;

    public static int fontSize = 28;
    public static String color = "#FFFFFF";
    public static String activeColor = "#4EA1FF";
    public static String background = "rgba(0,0,0,0.35)";
    public static boolean bold = true;
    public static boolean showTranslation = true;
    public static boolean locked = false;
    public static double opacity = 1;

    private LyricsState() {}
}
