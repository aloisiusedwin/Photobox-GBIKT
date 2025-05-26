// src/app/api/photobooth/route.js
import { NextResponse } from "next/server";
import { google } from "googleapis";
import QRCode from "qrcode";
import stream from "stream"; // Diperlukan untuk mengubah Buffer menjadi ReadableStream

// Fungsi untuk otentikasi dan mendapatkan instance drive API
// Fungsi ini sudah terlihat benar dari kode Anda sebelumnya.
async function getDriveService() {
  let credentials;
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT) {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT);
    } else {
      console.warn(
        "GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT tidak ditemukan. Jika ini lokal, pastikan GOOGLE_APPLICATION_CREDENTIALS (path file) diatur jika diperlukan, atau set GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT untuk konsistensi. Untuk Vercel, GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT wajib."
      );
    }
  } catch (e) {
    console.error("Gagal mem-parsing GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT:", e);
    throw new Error("Kredensial Service Account JSON tidak valid.");
  }

  const authOptions = {
    scopes: ["https://www.googleapis.com/auth/drive"],
  };

  if (credentials) {
    authOptions.credentials = credentials;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Fallback ke keyFile HANYA jika credentials dari JSON_CONTENT tidak ada
    // dan GOOGLE_APPLICATION_CREDENTIALS (path file) diset (biasanya untuk lokal)
    authOptions.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    console.log(
      "Menggunakan keyFile dari GOOGLE_APPLICATION_CREDENTIALS karena GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT tidak diset/kosong."
    );
  }

  // Pengecekan penting untuk Vercel production
  if (!authOptions.credentials && !authOptions.keyFile && process.env.VERCEL_ENV === "production") {
    console.error(
      "Kredensial Google Service Account (via GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT atau GOOGLE_APPLICATION_CREDENTIALS) wajib ada di environment Vercel production."
    );
    throw new Error("Konfigurasi kredensial server tidak lengkap untuk production.");
  }
  // Pengecekan umum jika tidak ada kredensial sama sekali
  if (!authOptions.credentials && !authOptions.keyFile) {
    console.error("Tidak ada metode kredensial (JSON_CONTENT atau APPLICATION_CREDENTIALS) yang ditemukan.");
    throw new Error("Kredensial Google Service Account tidak ditemukan.");
  }

  const auth = new google.auth.GoogleAuth(authOptions);
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
    // Pengecekan awal apakah salah satu metode kredensial diset di environment variables
    // Ini adalah pengecekan umum, getDriveService akan melakukan validasi lebih detail.
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error(
        "API Route Error: Tidak ada environment variable kredensial Google yang diset (GOOGLE_SERVICE_ACCOUNT_JSON_CONTENT atau GOOGLE_APPLICATION_CREDENTIALS)."
      );
      return NextResponse.json({ message: "Error: Konfigurasi server tidak lengkap (kredensial)." }, { status: 500 });
    }

    const data = await request.json();
    const { photos, selectedTemplate } = data;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ message: "Error: Foto tidak ditemukan atau format salah." }, { status: 400 });
    }
    console.log(`[API] Menerima ${photos.length} foto. Template: ${selectedTemplate}`);

    const drive = await getDriveService(); // getDriveService akan menangani detail otentikasi

    // 1. Buat folder baru yang unik di Google Drive
    const folderName = `Photobox Session - ${new Date().toISOString()} - Template ${selectedTemplate}`;
    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      // Anda bisa menentukan parent folder di sini jika mau:
      // parents: ['ID_FOLDER_INDUK_ANDA_DI_SINI']
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: "id, webViewLink",
    });
    const folderId = folder.data.id;
    const gdriveFolderWebViewLink = folder.data.webViewLink;
    console.log(`[API] Folder dibuat di Google Drive. ID: ${folderId}, Link: ${gdriveFolderWebViewLink}`);

    // 2. Atur izin folder
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
    console.log(`[API] Izin folder ${folderId} diatur ke 'reader' untuk 'anyone'.`);

    // 3. Upload setiap foto
    const uploadedPhotoLinks = [];
    for (let i = 0; i < photos.length; i++) {
      const photoDataUrl = photos[i];
      const photoBuffer = base64ToBuffer(photoDataUrl);
      const photoName = `photo_${i + 1}.jpg`;

      const bufferStream = new stream.PassThrough();
      bufferStream.end(photoBuffer);

      const fileMetadata = { name: photoName, parents: [folderId] };
      const media = { mimeType: "image/jpeg", body: bufferStream };

      const uploadedFile = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id, webViewLink, webContentLink",
      });
      console.log(
        `[API] Foto ${photoName} diupload. ID: ${uploadedFile.data.id}, Link Konten: ${uploadedFile.data.webContentLink}`
      );
      uploadedPhotoLinks.push(uploadedFile.data.webViewLink);
    }

    const urlForQrCode = gdriveFolderWebViewLink;
    const qrCodeDataUrl = await QRCode.toDataURL(urlForQrCode, { errorCorrectionLevel: "H" });
    console.log(`[API] QR Code dibuat untuk URL: ${urlForQrCode}`);

    return NextResponse.json(
      {
        message: "Foto berhasil diupload dan QR code dibuat!",
        gdriveFolderUrl: urlForQrCode,
        qrCodeUrl: qrCodeDataUrl,
        uploadedPhotoLinks: uploadedPhotoLinks,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API] Error di fungsi POST:", error.message, error.stack);
    let errorMessage = `Error internal server: ${error.message}`;
    if (error.response && error.response.data && error.response.data.error) {
      errorMessage = `Google API Error: ${error.response.data.error.message} (Code: ${error.response.data.error.code})`;
    } else if (error.errors && error.errors.length > 0) {
      errorMessage = `Google API Error: ${error.errors[0].message}`;
    }
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
