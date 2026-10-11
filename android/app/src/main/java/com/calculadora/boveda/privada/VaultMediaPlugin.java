package com.calculadora.boveda.privada;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.content.IntentSender;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.IntentSenderRequest;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

@CapacitorPlugin(name = "VaultMedia")
public class VaultMediaPlugin extends Plugin {

    /**
     * Guarda y restaura un archivo multimedia o documento en el almacenamiento público del dispositivo / galería (MediaStore)
     */
    @PluginMethod
    public void exportMediaToDevice(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String filename = call.getString("filename", "archivo_restaurado");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String category = call.getString("category", "photo");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("No se proporcionaron datos para exportar");
            return;
        }

        try {
            if (base64Data.contains(",")) {
                base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
            }

            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            ContentResolver resolver = getContext().getContentResolver();
            Uri targetUri = null;
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);

            boolean isPhoto = "photo".equalsIgnoreCase(category) || (mimeType != null && mimeType.startsWith("image/"));
            boolean isVideo = "video".equalsIgnoreCase(category) || (mimeType != null && mimeType.startsWith("video/"));
            boolean isAudio = "audio".equalsIgnoreCase(category) || (mimeType != null && mimeType.startsWith("audio/"));

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                try {
                    if (isPhoto) {
                        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Restauradas");
                        targetUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    } else if (isVideo) {
                        values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Restauradas");
                        targetUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
                    } else if (isAudio) {
                        values.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/Restauradas");
                        targetUri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
                    } else {
                        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Restauradas");
                        targetUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    }
                } catch (Exception exInsert) {
                    // Fallback sin ruta relativa si el dispositivo es estricto
                    values.remove(MediaStore.MediaColumns.RELATIVE_PATH);
                    if (isPhoto) {
                        targetUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                    } else if (isVideo) {
                        targetUri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
                    } else if (isAudio) {
                        targetUri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
                    } else {
                        targetUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    }
                }
            } else {
                File exportDir;
                if (isPhoto) {
                    exportDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
                } else if (isVideo) {
                    exportDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES);
                } else if (isAudio) {
                    exportDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC);
                } else {
                    exportDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                }
                if (!exportDir.exists()) exportDir.mkdirs();
                File destFile = new File(exportDir, filename);
                int counter = 1;
                while (destFile.exists()) {
                    String nameOnly = filename.contains(".") ? filename.substring(0, filename.lastIndexOf('.')) : filename;
                    String ext = filename.contains(".") ? filename.substring(filename.lastIndexOf('.')) : "";
                    destFile = new File(exportDir, nameOnly + "_" + counter + ext);
                    counter++;
                }
                try (FileOutputStream fos = new FileOutputStream(destFile)) {
                    fos.write(bytes);
                    fos.flush();
                }
                MediaScannerConnection.scanFile(
                    getContext(),
                    new String[]{destFile.getAbsolutePath()},
                    new String[]{mimeType},
                    null
                );

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", destFile.getAbsolutePath());
                call.resolve(ret);
                return;
            }

            if (targetUri == null) {
                call.reject("No se pudo crear el registro en la galería o almacenamiento");
                return;
            }

            try (OutputStream os = resolver.openOutputStream(targetUri)) {
                if (os == null) {
                    call.reject("No se pudo abrir el flujo de escritura del archivo");
                    return;
                }
                os.write(bytes);
                os.flush();
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                resolver.update(targetUri, values, null, null);
            }

            try {
                MediaScannerConnection.scanFile(
                    getContext(),
                    new String[]{targetUri.getPath()},
                    new String[]{mimeType},
                    null
                );
            } catch (Exception ignored) {}

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("uri", targetUri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error al guardar en el dispositivo: " + e.getMessage());
        }
    }

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
