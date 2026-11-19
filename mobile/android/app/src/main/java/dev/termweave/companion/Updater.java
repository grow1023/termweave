package dev.termweave.companion;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Checks for a newer signed APK, notifies, and installs it through PackageInstaller after a SHA-256 check.
 * The APK comes from the public GitHub Release (tools/public-release/attach_apk.sh), so a phone needs no
 * relay to stay current; the paired relay is asked only when GitHub offers nothing.
 */
final class Updater {
    static final String PREFS = "termweave", ORIGIN = "relayOrigin", ACTION_INSTALL = "dev.termweave.companion.INSTALL_UPDATE", ACTION_STATUS = "dev.termweave.companion.INSTALL_STATUS";
    private static final String CHANNEL = "updates";
    private static final long MAX_BYTES = 32L * 1024 * 1024;
    private static final String RELEASES = "https://api.github.com/repos/grow1023/termweave/releases/latest";
    /** the only place a GitHub download may come from: this repository's own release assets */
    private static final String DOWNLOADS = "https://github.com/grow1023/termweave/releases/download/";
    private static final String ASSET = "termweave-companion.apk";
    private static final Pattern TAG = Pattern.compile("v(\\d{1,4})\\.(\\d{1,3})\\.(\\d{1,3})");
    private static final OkHttpClient client = new OkHttpClient.Builder().callTimeout(120, TimeUnit.SECONDS).build();

    /** One download and install session at a time; cleared when the installer reports back or staging fails. */
    static volatile boolean installing;

    static final class Latest { long versionCode; String versionName, sha256, url; long bytes; }

    static String origin(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ORIGIN, null); }
    static void saveOrigin(Context context, String origin) { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(ORIGIN, origin).apply(); }

    /** Periodic background check; JobScheduler keeps it across reboots without extra dependencies. */
    static void schedule(Context context) {
        // a scheduling failure must never stop the app from opening; the on-open check still runs
        try {
            JobScheduler jobs = context.getSystemService(JobScheduler.class);
            if (jobs.getPendingJob(1) != null) return;
            jobs.schedule(new JobInfo.Builder(1, new ComponentName(context, UpdateJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(TimeUnit.HOURS.toMillis(6)).setPersisted(true).build());
        } catch (RuntimeException ignored) { /* e.g. a missing permission on a future Android version */ }
    }

    /** Blocking; returns the newest served release only when it is newer than the installed one. */
    static Latest newer(Context context) throws Exception {
        Latest latest = null;
        // unreachable or rate-limited: a paired relay may still serve one. The reason goes to logcat, nothing else would show it.
        try { latest = fromGitHub(); } catch (Exception failure) { Log.w("TermWeaveUpdate", "GitHub release check failed: " + failure); }
        if (latest == null) latest = fromRelay(context);
        if (latest == null) return null;
        long installed = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).getLongVersionCode();
        return latest.versionCode > installed ? latest : null;
    }

    private static boolean valid(Latest latest) {
        return latest.sha256.matches("[a-f0-9]{64}") && latest.bytes >= 1 && latest.bytes <= MAX_BYTES && latest.versionCode > 0;
    }

    /** The latest GitHub Release, when it carries the APK: its tag is the version, the asset's digest the expected hash. */
    private static Latest fromGitHub() throws Exception {
        try (Response response = client.newCall(new Request.Builder().url(RELEASES).header("Accept", "application/vnd.github+json").build()).execute()) {
            if (!response.isSuccessful() || response.body() == null) { Log.w("TermWeaveUpdate", "GitHub answered " + response.code()); return null; }
            // a body cut at the limit does not parse, and the caller treats that as no answer
            JSONObject release = new JSONObject(response.peekBody(262144).string());
            Matcher tag = TAG.matcher(release.optString("tag_name"));
            JSONArray assets = release.optJSONArray("assets");
            if (!tag.matches() || assets == null) return null;
            for (int index = 0; index < assets.length(); index++) {
                JSONObject asset = assets.getJSONObject(index);
                if (!ASSET.equals(asset.optString("name"))) continue;
                String digest = asset.optString("digest"), url = asset.optString("browser_download_url");
                if (!digest.startsWith("sha256:") || !url.startsWith(DOWNLOADS)) return null;
                Latest latest = new Latest();
                // the same rule as build.gradle.kts: x.y.z -> x*1000000 + y*1000 + z
                latest.versionCode = Long.parseLong(tag.group(1)) * 1000000 + Long.parseLong(tag.group(2)) * 1000 + Long.parseLong(tag.group(3));
                latest.versionName = release.optString("tag_name").substring(1);
                latest.sha256 = digest.substring(7); latest.bytes = asset.optLong("size"); latest.url = url;
                return valid(latest) ? latest : null;
            }
            return null;
        }
    }

    private static Latest fromRelay(Context context) throws Exception {
        String base = origin(context);
        if (base == null) return null;
        try (Response response = client.newCall(new Request.Builder().url(base + "/download/termweave-companion.json").build()).execute()) {
            if (!response.isSuccessful() || response.body() == null) return null;
            // peekBody stops reading at the limit: a huge body never fills memory in the background job
            String text = response.peekBody(2049).string();
            if (text.length() > 2048) return null;
            JSONObject json = new JSONObject(text);
            Latest latest = new Latest();
            latest.versionCode = json.getLong("versionCode"); latest.versionName = json.optString("versionName");
            latest.sha256 = json.getString("sha256"); latest.bytes = json.getLong("bytes");
            latest.url = base + "/download/termweave-companion.apk";
            return valid(latest) ? latest : null;
        }
    }

    static void notify(Context context, Latest latest) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "앱 업데이트", NotificationManager.IMPORTANCE_DEFAULT));
        PendingIntent open = PendingIntent.getActivity(context, 3, new Intent(context, MainActivity.class).setAction(ACTION_INSTALL), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        manager.notify(7, new Notification.Builder(context, CHANNEL).setSmallIcon(R.drawable.launcher)
            .setContentTitle("TermWeave Companion " + latest.versionName)
            .setContentText("새 버전이 있습니다. 눌러서 설치하십시오.").setContentIntent(open).setAutoCancel(true).build());
    }

    static void offer(Activity activity, Latest latest) {
        if (installing || activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity).setTitle("새 버전 " + latest.versionName)
            .setMessage("TermWeave Companion 새 버전을 내려받아 설치합니다. 파일은 서명과 SHA-256을 확인한 뒤에 설치됩니다.")
            .setPositiveButton("설치", (d, w) -> install(activity, latest)).setNegativeButton("나중에", null).show();
    }

    static void install(Activity activity, Latest latest) {
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(activity, "이 앱의 '알 수 없는 앱 설치'를 허용한 뒤 다시 설치를 누르십시오.", Toast.LENGTH_LONG).show();
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        if (installing) return;
        installing = true;
        Toast.makeText(activity, "업데이트를 내려받고 있습니다.", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            String error = null;
            try { stage(activity, latest); } catch (Exception failure) { installing = false; error = String.valueOf(failure.getMessage() != null ? failure.getMessage() : failure); }
            String message = error;
            if (message != null) activity.runOnUiThread(() -> Toast.makeText(activity, "업데이트를 설치하지 못했습니다: " + message, Toast.LENGTH_LONG).show());
        }).start();
    }

    /** Streams the APK into an install session while hashing it; a hash or size mismatch abandons the session. */
    private static void stage(Context context, Latest latest) throws Exception {
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(context.getPackageName());
        params.setSize(latest.bytes);
        int id = installer.createSession(params);
        boolean committed = false;
        try (PackageInstaller.Session session = installer.openSession(id);
             Response response = client.newCall(new Request.Builder().url(latest.url).build()).execute()) {
            if (!response.isSuccessful() || response.body() == null) throw new IOException("다운로드 실패 " + response.code());
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0;
            try (InputStream in = response.body().byteStream(); OutputStream out = session.openWrite("base.apk", 0, latest.bytes)) {
                byte[] block = new byte[65536]; int count;
                while ((count = in.read(block)) != -1) {
                    total += count;
                    if (total > latest.bytes) throw new IOException("크기 불일치");
                    digest.update(block, 0, count); out.write(block, 0, count);
                }
                session.fsync(out);
            }
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format("%02x", b));
            if (total != latest.bytes || !hex.toString().equals(latest.sha256)) throw new IOException("SHA-256 불일치");
            // FLAG_MUTABLE: the installer fills in the status extras, including the confirmation intent
            // a non-exported receiver: only the installer, through this PendingIntent, can deliver a status
            PendingIntent status = PendingIntent.getBroadcast(context, 4, new Intent(context, InstallStatusReceiver.class).setAction(ACTION_STATUS), PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            session.commit(status.getIntentSender());
            committed = true;
        } finally {
            if (!committed) installer.abandonSession(id);
        }
    }

    /** Installer status from InstallStatusReceiver. In the background a direct launch can be blocked, so the confirmation goes into a notification. */
    static void onStatus(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            @SuppressWarnings("deprecation") Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT); // typed overload needs API 33
            if (confirm == null) { installing = false; return; }
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (MainActivity.visible) context.startActivity(confirm);
            else context.getSystemService(NotificationManager.class).notify(7, new Notification.Builder(context, CHANNEL).setSmallIcon(R.drawable.launcher)
                .setContentTitle("TermWeave Companion 업데이트 준비 완료").setContentText("눌러서 설치를 확인하십시오.").setAutoCancel(true)
                .setContentIntent(PendingIntent.getActivity(context, 5, confirm, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)).build());
            return;
        }
        installing = false;
        if (status != PackageInstaller.STATUS_SUCCESS) Toast.makeText(context, "설치가 취소되었거나 실패했습니다.", Toast.LENGTH_LONG).show();
    }
}
