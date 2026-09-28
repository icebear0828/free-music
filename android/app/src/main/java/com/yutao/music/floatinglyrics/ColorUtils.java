package com.yutao.music.floatinglyrics;

import android.graphics.Color;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parses the CSS colour strings the shared web settings UI produces. */
public final class ColorUtils {

    private static final Pattern RGBA = Pattern.compile(
        "rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*(?:,\\s*([0-9.]+)\\s*)?\\)"
    );

    public static int parse(String value, int fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return fallback;

        if (trimmed.startsWith("#")) {
            try {
                return Color.parseColor(trimmed);
            } catch (IllegalArgumentException ignored) {
                return fallback;
            }
        }

        Matcher matcher = RGBA.matcher(trimmed.toLowerCase(Locale.US));
        if (matcher.matches()) {
            int r = clamp(Integer.parseInt(matcher.group(1)));
            int g = clamp(Integer.parseInt(matcher.group(2)));
            int b = clamp(Integer.parseInt(matcher.group(3)));
            String alphaGroup = matcher.group(4);
            int a = alphaGroup == null ? 255 : clamp((int) Math.round(Double.parseDouble(alphaGroup) * 255));
            return Color.argb(a, r, g, b);
        }

        try {
            return Color.parseColor(trimmed);
        } catch (IllegalArgumentException ignored) {
            return fallback;
        }
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(255, value));
    }

    private ColorUtils() {}
}
