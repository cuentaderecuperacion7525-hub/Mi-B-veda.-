package com.calculadora.boveda.privada

import android.app.Activity
import android.app.PendingIntent
import android.content.ContentUris
import android.content.IntentSender
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "VaultMedia")
class VaultMediaPlugin : Plugin() {

    private var pendingCall: PluginCall? = null

    private lateinit var deleteRequestLauncher: ActivityResultLauncher<IntentSenderRequest>

    override fun load() {
        super.load()

        // Registramos el launcher para escuchar la respuesta del diálogo de confirmación de Android
        deleteRequestLauncher = activity.registerForActivityResult(
            ActivityResultContracts.StartIntentSenderForResult()
        ) { result ->
            val call = pendingCall ?: return@registerForActivityResult
            if (result.resultCode == Activity.RESULT_OK) {
                val ret = JSObject()
                ret.put("success", true)
                ret.put("message", "Archivo eliminado exitosamente de la galería pública")
                call.resolve(ret)
            } else {
                val ret = JSObject()
                ret.put("success", false)
                ret.put("message", "El usuario rechazó la eliminación del archivo original")
                call.resolve(ret)
            }
            pendingCall = null
        }
    }

    @PluginMethod
    fun deleteFromGallery(call: PluginCall) {
        val uriString = call.getString("uri")
        val filename = call.getString("filename")

        val targetUri: Uri? = if (!uriString.isNullOrEmpty()) {
            Uri.parse(uriString)
        } else if (!filename.isNullOrEmpty()) {
            findMediaStoreUriByFilename(filename)
        } else {
            call.reject("Debe proporcionar un uri o filename")
            return
        }

        if (targetUri == null) {
            val ret = JSObject()
            ret.put("success", false)
            ret.put("message", "No se encontró el archivo en MediaStore")
            call.resolve(ret)
            return
        }

        pendingCall = call
        val resolver = context.contentResolver

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+ (API 30+): Diálogo nativo obligatorio del sistema
                val urisToDelete = listOf(targetUri)
                val pendingIntent: PendingIntent = MediaStore.createDeleteRequest(resolver, urisToDelete)
                val request = IntentSenderRequest.Builder(pendingIntent.intentSender).build()
                deleteRequestLauncher.launch(request)
            } else {
                // Android 10 o inferior
                val rowsDeleted = resolver.delete(targetUri, null, null)
                val ret = JSObject()
                ret.put("success", rowsDeleted > 0)
                call.resolve(ret)
                pendingCall = null
            }
        } catch (e: Exception) {
            call.reject("Error al solicitar eliminación en Android: ${e.message}", e)
            pendingCall = null
        }
    }

    /**
     * Busca la URI pública de la foto en MediaStore a partir de su nombre de archivo
     */
    private fun findMediaStoreUriByFilename(filename: String): Uri? {
        val projection = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME)
        val selection = "${MediaStore.MediaColumns.DISPLAY_NAME} = ?"
        val selectionArgs = arrayOf(filename)

        val collections = listOf(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        )

        for (collection in collections) {
            context.contentResolver.query(
                collection,
                projection,
                selection,
                selectionArgs,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idColumn = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                    val id = cursor.getLong(idColumn)
                    return ContentUris.withAppendedId(collection, id)
                }
            }
        }
        return null
    }
}
