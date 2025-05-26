// src/app/page.js
"use client"; // Menandakan ini adalah Client Component karena akan ada interaksi

import { useState } from "react";

export default function HomePage() {
  const [selectedTemplate, setSelectedTemplate] = useState("template1"); // Contoh state untuk template
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [countdown, setCountdown] = useState(0); // Untuk jeda antar foto

  const templates = [
    { id: "template1", name: "Template Klasik", previewUrl: "/templates/classic-preview.png" },
    { id: "template2", name: "Template Fun", previewUrl: "/templates/fun-preview.png" },
    { id: "template3", name: "Template Elegan", previewUrl: "/templates/elegant-preview.png" },
  ];

  // --- FUNGSI-FUNGSI AKAN DITAMBAHKAN DI SINI ---
  const handleStartPhotoSession = async () => {
    if (isTakingPhoto) return;

    setIsTakingPhoto(true);
    setPhotos([]);
    setQrCodeUrl("");
    alert(`Memulai sesi foto dengan template: ${selectedTemplate}! Fitur kamera belum diimplementasikan.`);
    // Logika untuk memulai sesi foto (akses kamera, 3x foto, upload, QR) akan ditambahkan di sini
    // Untuk sekarang, kita simulasikan saja
    setTimeout(() => {
      setIsTakingPhoto(false);
      setQrCodeUrl("https://via.placeholder.com/150/000000/FFFFFF/?text=ContohQR"); // URL QR Code dummy
      setPhotos([
        "https://via.placeholder.com/300x200/FF0000/FFFFFF/?text=Foto1",
        "https://via.placeholder.com/300x200/00FF00/FFFFFF/?text=Foto2",
        "https://via.placeholder.com/300x200/0000FF/FFFFFF/?text=Foto3",
      ]);
      console.log("Sesi foto selesai (simulasi)");
    }, 2000); // Simulasi proses
  };

  // --- Placeholder untuk fungsi lainnya ---
  // const handleSelectTemplate = (templateId) => { ... }
  // const capturePhoto = () => { ... }
  // const uploadToDriveAndGetQR = (capturedPhotos) => { ... }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-500 to-red-500 flex flex-col items-center justify-center p-4 text-white">
      <header className="mb-8 text-center">
        <h1 className="text-5xl font-bold mb-2">Photobox Acara Seru!</h1>
        <p className="text-xl text-purple-200">Abadikan momen spesialmu dengan gaya!</p>
      </header>

      {!isTakingPhoto && !qrCodeUrl && (
        <main className="bg-white bg-opacity-20 backdrop-blur-lg p-8 rounded-xl shadow-2xl w-full max-w-md">
          <section id="template-selection" className="mb-6">
            <h2 className="text-2xl font-semibold mb-4 text-center text-gray-800">Pilih Template Favoritmu:</h2>
            <div className="grid grid-cols-3 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`p-2 border-2 rounded-lg cursor-pointer transition-all duration-200 ease-in-out
                              ${
                                selectedTemplate === template.id
                                  ? "border-yellow-400 ring-2 ring-yellow-400 scale-105"
                                  : "border-purple-300 hover:border-purple-500"
                              }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <img
                    src={template.previewUrl}
                    alt={template.name}
                    className="w-full h-20 object-cover rounded-md mb-2"
                    onError={(e) => (e.target.src = "https://via.placeholder.com/100x60?text=Preview")}
                  />
                  <p className="text-xs text-center font-medium text-gray-700">{template.name}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-center mt-4 text-gray-600">
              Template terpilih:{" "}
              <span className="font-bold">{templates.find((t) => t.id === selectedTemplate)?.name}</span>
            </p>
          </section>

          <section id="start-button" className="text-center">
            <button
              onClick={handleStartPhotoSession}
              disabled={isTakingPhoto}
              className="bg-yellow-400 hover:bg-yellow-500 text-gray-800 font-bold py-3 px-12 rounded-full text-xl shadow-lg transform transition-all duration-150 ease-in-out hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-300 disabled:opacity-50"
            >
              {isTakingPhoto ? "Sedang Memproses..." : "Mulai Foto!"}
            </button>
          </section>
        </main>
      )}

      {isTakingPhoto && (
        <section id="photo-session" className="text-center">
          {/* Placeholder untuk tampilan kamera dan hitungan mundur */}
          <div className="w-96 h-72 bg-gray-800 rounded-lg mb-4 flex items-center justify-center text-2xl">
            (Tampilan Kamera Akan Muncul Di Sini)
          </div>
          <p className="text-3xl font-bold">{countdown > 0 ? `Siap-siap... ${countdown}` : "Ambil Gaya!"}</p>
          <p className="mt-2">Foto ke-{photos.length + 1} dari 3</p>
        </section>
      )}

      {qrCodeUrl && !isTakingPhoto && (
        <section
          id="qr-code-display"
          className="bg-white bg-opacity-20 backdrop-blur-lg p-8 rounded-xl shadow-2xl w-full max-w-md text-center"
        >
          <h2 className="text-3xl font-semibold mb-4 text-gray-800">Foto Selesai!</h2>
          <p className="text-gray-700 mb-6">Scan QR code di bawah ini untuk melihat dan mengunduh fotomu.</p>
          <div className="flex justify-center mb-6">
            <img
              src={qrCodeUrl}
              alt="QR Code untuk fotomu"
              className="w-56 h-56 md:w-64 md:h-64 border-4 border-white rounded-lg shadow-lg"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {photos.map((photoSrc, index) => (
              <img
                key={index}
                src={photoSrc}
                alt={`Foto ${index + 1}`}
                className="w-full h-auto rounded-md shadow-sm"
              />
            ))}
          </div>
          <button
            onClick={() => {
              setQrCodeUrl("");
              setPhotos([]);
              setSelectedTemplate("template1"); // Reset ke template default
            }}
            className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-8 rounded-full text-lg shadow-md transition-transform duration-150 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-purple-300"
          >
            Ambil Foto Lagi
          </button>
        </section>
      )}

      <footer className="mt-12 text-center">
        <p className="text-sm text-purple-200">&copy; {new Date().getFullYear()} SIL GBIKT. Dibuat dengan ❤️.</p>
      </footer>
    </div>
  );
}
