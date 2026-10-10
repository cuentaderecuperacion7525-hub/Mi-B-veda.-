package com.calculadora.boveda.privada;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.content.IntentSender;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.IntentSenderRequest;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

@CapacitorPlugin(name = "VaultMedia")
public class VaultMediaPlugin extends Plugin {

    @PluginMethod
    public void openGalleryApp(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            try {
                Intent fallback = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_GALLERY);
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception ex) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", ex.getMessage());
                call.resolve(ret);
            }
        }
    }

    /**
     * Borrado por lotes de archivos multimedia en Android MediaStore.
     * Soporta recibir items con { filename, size, lastModified, mimeType, uri }.
     */
    @PluginMethod
    public void deleteBatchFromGallery(PluginCall call) {
        JSArray itemsArray = call.getArray("items");
        if (itemsArray == null || itemsArray.length() == 0) {
            String filename = call.getString("filename");
            if (filename != null && !filename.isEmpty()) {
                itemsArray = new JSArray();
                JSObject single = new JSObject();
                single.put("filename", filename);
                if (call.getData().has("size")) single.put("size", call.getInt("size"));
                if (call.getData().has("lastModified")) single.put("lastModified", call.getLong("lastModified"));
                if (call.getData().has("uri")) single.put("uri", call.getString("uri"));
                itemsArray.put(single);
            } else {
                call.reject("Se requiere array 'items' o parámetro 'filename'");
                return;
            }
        }

        try {
            ContentResolver resolver = getContext().getContentResolver();
            List<Uri> urisToDelete = new ArrayList<>();

            Uri[] baseUris = new Uri[]{
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            };

            for (int i = 0; i < itemsArray.length(); i++) {
                JSONObject item = itemsArray.getJSONObject(i);
                String uriStr = item.optString("uri", null);
                String filename = item.optString("filename", item.optString("name", null));
                long size = item.optLong("size", -1);
                long lastModified = item.optLong("lastModified", -1);

                if (uriStr != null && !uriStr.isEmpty() && uriStr.startsWith("content://")) {
                    Uri parsed = Uri.parse(uriStr);
                    if (!urisToDelete.contains(parsed)) {
                        urisToDelete.add(parsed);
                    }
                    continue;
                }

                if (filename == null || filename.isEmpty()) continue;

                Uri foundUri = findMediaStoreUri(resolver, baseUris, filename, size, lastModified);
                if (foundUri != null && !urisToDelete.contains(foundUri)) {
                    urisToDelete.add(foundUri);
                }
            }

            if (urisToDelete.isEmpty()) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("matchedCount", 0);
                ret.put("message", "No se encontraron los archivos en MediaStore");
                call.resolve(ret);
                return;
            }

            // En Android 11+ (API 30+) MediaStore.createDeleteRequest pide permiso al usuario con el diálogo nativo del sistema
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                PendingIntent pi = MediaStore.createDeleteRequest(resolver, urisToDelete);
                IntentSender intentSender = pi.getIntentSender();
                try {
                    // Lanzar directamente mediante el Activity host
                    getActivity().startIntentSenderForResult(intentSender, 2002, null, 0, 0, 0, null);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("requested", true);
                    ret.put("urisCount", urisToDelete.size());
                    call.resolve(ret);
                } catch (Exception exSender) {
                    call.reject("No se pudo iniciar el diálogo de eliminación: " + exSender.getMessage());
                }
            } else {
                int deletedCount = 0;
                for (Uri u : urisToDelete) {
                    try {
                        deletedCount += resolver.delete(u, null, null);
                    } catch (Exception ex) {
                        // continuar
                    }
                }
                JSObject ret = new JSObject();
                ret.put("success", deletedCount > 0);
                ret.put("deletedCount", deletedCount);
                call.resolve(ret);
            }
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void deleteFromGallery(PluginCall call) {
        deleteBatchFromGallery(call);
    }

    /**
     * Búsqueda flexible y robusta en MediaStore:
     * 1) Por Nombre y Tamaño exactos
     * 2) Por Nombre exacto
     * 3) Por prefijo del nombre (en caso de que Photo Picker haya modificado extensión o sufijo)
     * 4) Por Tamaño exacto si es único
     */
    private Uri findMediaStoreUri(ContentResolver resolver, Uri[] baseUris, String filename, long size, long lastModified) {
        for (Uri baseUri : baseUris) {
            String[] projection = new String[]{
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.DATE_MODIFIED
            };

            // 1. Intento por Nombre y Tamaño
            if (size > 0 && filename != null && !filename.isEmpty()) {
                String selection = MediaStore.MediaColumns.DISPLAY_NAME + " = ? AND " + MediaStore.MediaColumns.SIZE + " = ?";
                String[] selectionArgs = new String[]{filename, String.valueOf(size)};
                try (Cursor cursor = resolver.query(baseUri, projection, selection, selectionArgs, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
                        return ContentUris.withAppendedId(baseUri, id);
                    }
                } catch (Exception ignored) {}
            }

            // 2. Intento por Nombre exacto
            if (filename != null && !filename.isEmpty()) {
                String selectionName = MediaStore.MediaColumns.DISPLAY_NAME + " = ?";
                String[] selectionArgsName = new String[]{filename};
                try (Cursor cursor = resolver.query(baseUri, projection, selectionName, selectionArgsName, null)) {
                    if (cursor != null && cursor.moveToFirst()) {
                        long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
                        return ContentUris.withAppendedId(baseUri, id);
                    }
                } catch (Exception ignored) {}
            }

            // 3. Intento sin extensión si fue cambiado (ej: "IMG_20261009_072505")
            if (filename != null && filename.contains(".")) {
                String baseName = filename.substring(0, filename.lastIndexOf('.'));
                if (baseName.length() >= 5) {
                    String selectionLike = MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?";
                    String[] selectionArgsLike = new String[]{baseName + "%"};
                    try (Cursor cursor = resolver.query(baseUri, projection, selectionLike, selectionArgsLike, null)) {
                        if (cursor != null && cursor.moveToFirst()) {
                            long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
                            return ContentUris.withAppendedId(baseUri, id);
                        }
                    } catch (Exception ignored) {}
                }
            }

            // 4. Intento por tamaño exacto (si el tamaño es > 10KB para evitar colisiones pequeñas)
            if (size > 10240) {
                String selectionSize = MediaStore.MediaColumns.SIZE + " = ?";
                String[] selectionArgsSize = new String[]{String.valueOf(size)};
                try (Cursor cursor = resolver.query(baseUri, projection, selectionSize, selectionArgsSize, null)) {
                    if (cursor != null && cursor.getCount() == 1 && cursor.moveToFirst()) {
                        long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID));
                        return ContentUris.withAppendedId(baseUri, id);
                    }
                } catch (Exception ignored) {}
            }
        }
        return null;
    }
}
