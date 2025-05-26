// src/app/api/photobooth/route.js
import { NextResponse } from "next/server";
import { google } from "googleapis";
import QRCode from "qrcode";
import stream from "stream"; // Diperlukan untuk mengubah Buffer menjadi ReadableStream

// Fungsi untuk otentikasi dan mendapatkan instance drive API
async function getDriveService() {
  const auth = new google.auth.GoogleAuth({
    // Jika GOOGLE_APPLICATION_CREDENTIALS adalah path ke file JSON:
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    // Jika GOOGLE_SERVICE_ACCOUNT_JSON berisi string JSON:
    // credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ["https://www.googleapis.com/auth/drive"], // Scope penuh untuk Drive
  });

  const authClient = await auth.getClient();
  return google.drive({ version: "v3", auth: authClient });
}

// Fungsi untuk mengubah base64 data URL menjadi Buffer
function base64ToBuffer(dataUrl) {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { photos, selectedTemplate } = data;

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      console.error("API Route Error: Kredensial Google Service Account tidak dikonfigurasi di environment variables.");
      return NextResponse.json({ message: "Error: Konfigurasi server tidak lengkap (kredensial)." }, { status: 500 });
    }

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ message: "Error: Foto tidak ditemukan atau format salah." }, { status: 400 });
    }
    console.log(`[API] Menerima ${photos.length} foto. Template: ${selectedTemplate}`);

    const drive = await getDriveService();

    // 1. Buat folder baru yang unik di Google Drive
    const folderName = `Photobox Session - ${new Date().toISOString()} - Template ${selectedTemplate}`;
    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      // Anda bisa menentukan parent folder di sini jika mau:
      // parents: ['ID_FOLDER_INDUK_ANDA']
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: "id, webViewLink", // Ambil id dan webViewLink
    });
    const folderId = folder.data.id;
    const gdriveFolderWebViewLink = folder.data.webViewLink; // Link untuk dilihat di browser Drive
    console.log(`[API] Folder dibuat di Google Drive. ID: ${folderId}, Link: ${gdriveFolderWebViewLink}`);

    // 2. Atur izin folder agar bisa diakses publik (siapa saja dengan link bisa melihat)
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
    console.log(`[API] Izin folder ${folderId} diatur ke 'reader' untuk 'anyone'.`);

    // 3. Upload setiap foto ke folder tersebut
    const uploadedPhotoLinks = [];
    for (let i = 0; i < photos.length; i++) {
      const photoDataUrl = photos[i];
      const photoBuffer = base64ToBuffer(photoDataUrl);
      const photoName = `photo_${i + 1}.jpg`;

      // Buat ReadableStream dari Buffer
      const bufferStream = new stream.PassThrough();
      bufferStream.end(photoBuffer);

      const fileMetadata = {
        name: photoName,
        parents: [folderId],
      };
      const media = {
        mimeType: "image/jpeg",
        body: bufferStream, // Gunakan stream
      };

      const uploadedFile = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id, webViewLink, webContentLink", // webContentLink untuk direct download jika memungkinkan
      });
      console.log(
        `[API] Foto ${photoName} diupload. ID: ${uploadedFile.data.id}, Link Konten: ${uploadedFile.data.webContentLink}`
      );
      uploadedPhotoLinks.push(uploadedFile.data.webViewLink); // atau webContentLink jika ingin direct file
    }

    // Kita akan menggunakan link folder utama untuk QR code
    const urlForQrCode = gdriveFolderWebViewLink; // Link ke folder

    // 4. Generate QR Code dari URL folder Google Drive
    // Menghasilkan QR code sebagai Data URL (base64 string)
    const qrCodeDataUrl = await QRCode.toDataURL(urlForQrCode, { errorCorrectionLevel: "H" });
    console.log(`[API] QR Code dibuat untuk URL: ${urlForQrCode}`);

    return NextResponse.json(
      {
        message: "Foto berhasil diupload dan QR code dibuat!",
        gdriveFolderUrl: urlForQrCode,
        qrCodeUrl: qrCodeDataUrl, // Kirim data URL QR code
        uploadedPhotoLinks: uploadedPhotoLinks, // Opsional: kirim link tiap foto juga
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API] Error:", error.message, error.stack);
    let errorMessage = `Error internal server: ${error.message}`;
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage = `Google API Error: ${error.response.data.error.message} (Code: ${error.response.data.error.code})`;
    } else if (error.errors && error.errors.length > 0) {
      // Error dari googleapis client
      errorMessage = `Google API Error: ${error.errors[0].message}`;
    }
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
