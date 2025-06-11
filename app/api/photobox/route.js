// src/app/api/photobox/route.js
import { NextResponse } from "next/server";
import { google } from "googleapis";
import QRCode from "qrcode";
import stream from "stream";

async function getDriveService() {
  console.log("[API Server] Initializing Google Drive service...");

  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFilePath) {
    console.error(
      "[API Server] FATAL: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set."
    );
    throw new Error(
      "Konfigurasi kredensial server (path file) tidak ditemukan."
    );
  }

  console.log(`[API Server] Using keyFile path from env: ${keyFilePath}`);

  const auth = new google.auth.GoogleAuth({
    keyFile: keyFilePath, // Langsung gunakan path ke file kredensial
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const authClient = await auth.getClient();
  console.log("[API Server] Google Auth client created successfully.");
  return google.drive({ version: "v3", auth: authClient });
}

function base64ToBuffer(dataUrl) {
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

export async function POST(request) {
  try {
    const data = await request.json();
    const { photos, selectedTemplate } = data;

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json(
        { message: "Error: Foto tidak ditemukan atau format salah." },
        { status: 400 }
      );
    }

    const drive = await getDriveService();

    // 1. Buat folder baru
    const folderName = `Photobox Session - ${new Date().toISOString()}`;
    const folder = await drive.files.create({
      resource: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id, webViewLink",
    });
    const folderId = folder.data.id;
    console.log(`[API Server] Folder created with ID: ${folderId}`);

    // 2. Atur izin folder
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { role: "reader", type: "anyone" },
    });
    console.log(`[API Server] Permissions set for folder ID: ${folderId}`);

    // 3. Upload setiap foto
    for (let i = 0; i < photos.length; i++) {
      const photoBuffer = base64ToBuffer(photos[i]);
      const bufferStream = new stream.PassThrough();
      bufferStream.end(photoBuffer);

      await drive.files.create({
        resource: { name: `foto_${i + 1}.jpg`, parents: [folderId] },
        media: { mimeType: "image/jpeg", body: bufferStream },
        fields: "id",
      });
      console.log(
        `[API Server] Photo ${i + 1} uploaded to folder ${folderId}.`
      );
    }

    // 4. Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(folder.data.webViewLink, {
      errorCorrectionLevel: "H",
    });
    console.log("[API Server] QR Code generated successfully.");

    return NextResponse.json(
      {
        message: "Upload berhasil!",
        gdriveFolderUrl: folder.data.webViewLink,
        qrCodeUrl: qrCodeDataUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[API Server] UNCAUGHT ERROR in POST handler:", error);
    return NextResponse.json(
      { message: `Error Internal Server: ${error.message}` },
      { status: 500 }
    );
  }
}
