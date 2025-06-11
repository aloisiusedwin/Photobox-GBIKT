// src/app/page.js
"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// Konfigurasi Sesi Foto
const PRE_CAPTURE_COUNTDOWN = 3;
const INTER_PHOTO_DELAY = 8;
// const activePhotoCount = 2;

export default function HomePage() {
  // --- STATE MANAGEMENT ---
  const [selectedTemplate, setSelectedTemplate] = useState("template1");
  const [sessionState, setSessionState] = useState("idle");
  const [photos, setPhotos] = useState([]);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [cameraError, setCameraError] = useState(null);
  const [activePhotoCount, setActivePhotoCount] = useState(2);

  // --- REFS ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // --- DATA TEMPLATE (SEKARANG HANYA 2 TEMPLATE) ---
  const templates = [
    {
      id: "template1",
      name: "Layout A",
      previewUrl: "assets/template1.png", 
      stripImageUrl: "assets/template1.png",
      description: "template 1",
      photoCount: 2,
      photoAreas: [
        { x: 50, y: 100, width: 200, height: 250 },
        { x: 300, y: 150, width: 200, height: 250 }
      ]
    },
    {
      id: "template2",
      name: "Layout B",
      previewUrl: "assets/template2.png",
      stripImageUrl: "assets/template2.png",
      description: "Desain Vertikal Modern",
      photoCount: 3,
      photoAreas: [
        { x: 70, y: 50, width: 250, height: 180 },
        { x: 70, y: 300, width: 250, height: 180 },
        { x: 70, y: 550, width: 250, height: 180 } 
      ]
    },

  ];

  // --- FUNGSI-FUNGSI INTI ---
  const clearCountdownInterval = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);
  const startCamera = useCallback(async () => {
    if (!videoRef.current) {
      setCameraError("Gagal menginisialisasi kamera.");
      setSessionState("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve, reject) => {
          const el = videoRef.current;
          if (!el) return reject();
          el.onloadedmetadata = () => resolve();
          setTimeout(() => reject(new Error("Timeout")), 5000);
        });
        setSessionState("camera_ready");
      }
    } catch (err) {
      setCameraError(`Error Kamera: ${err.name}`);
      setSessionState("error");
    }
  }, [setSessionState, setCameraError]);
  const stopCamera = useCallback(() => {
    clearCountdownInterval();
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, [clearCountdownInterval]);
  const captureFrame = useCallback(() => {
    if (photos.length >= activePhotoCount) return;
    if (videoRef.current && canvasRef.current) {
      const v = videoRef.current;
      const c = canvasRef.current;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      setPhotos((p) => [...p, c.toDataURL("image/jpeg", 0.9)]);
    }
  }, [photos.length]);
  const processPhotosAndGetQR = useCallback(
    async (capturedPhotos, templateId) => {
      /* ... (Logika sama seperti sebelumnya) ... */ try {
        const res = await fetch("/api/photobox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photos: capturedPhotos, selectedTemplate: templateId }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);
        return result;
      } catch (error) {
        setCameraError(`Gagal upload: ${error.message}`);
        setSessionState("error");
        return null;
      }
    },
    [setCameraError, setSessionState]
  );
  const proceedToNextStep = useCallback(() => {
    /* ... (Logika sama seperti sebelumnya) ... */ clearCountdownInterval();
    if (currentPhotoIndex < activePhotoCount) {
      setSessionState("countdown_to_capture");
      setCountdown(PRE_CAPTURE_COUNTDOWN);
      countdownIntervalRef.current = setInterval(
        () => setCountdown((cd) => (cd <= 1 ? (clearCountdownInterval(), setSessionState("capturing"), 0) : cd - 1)),
        1000
      );
    } else {
      setSessionState("processing_server");
    }
  }, [currentPhotoIndex, clearCountdownInterval]);

  // --- USEEFFECT HOOKS ---
  useEffect(() => {
    /* 1. Transisi dari 'capturing' */ if (sessionState === "capturing") {
      captureFrame();
      const newIdx = currentPhotoIndex + 1;
      setCurrentPhotoIndex(newIdx);
      if (newIdx < activePhotoCount) {
        setSessionState("inter_photo_countdown");
        setCountdown(INTER_PHOTO_DELAY);
        countdownIntervalRef.current = setInterval(
          () => setCountdown((cd) => (cd <= 1 ? (clearCountdownInterval(), proceedToNextStep(), 0) : cd - 1)),
          1000
        );
      } else {
        setSessionState("processing_server");
      }
    }
  }, [sessionState, currentPhotoIndex, captureFrame, clearCountdownInterval, proceedToNextStep]);
  useEffect(() => {
    /* 2. Mulai kamera */ if (sessionState === "starting_camera") {
      if (videoRef.current) startCamera();
    }
  }, [sessionState, startCamera]);
  useEffect(() => {
    /* 3. Mulai sesi foto */ if (sessionState === "camera_ready") proceedToNextStep();
  }, [sessionState, proceedToNextStep]);
  useEffect(() => {
    /* 4. Upload ke server */ const upload = async () => {
      stopCamera();
      const res = await processPhotosAndGetQR(photos, selectedTemplate);
      if (res) {
        setQrCodeUrl(res.qrCodeUrl);
        setSessionState("finished");
      }
    };
    if (sessionState === "processing_server" && photos.length === activePhotoCount) upload();
  }, [sessionState, photos, selectedTemplate, processPhotosAndGetQR, stopCamera]);

  // --- FUNGSI HANDLER ---
  const handleStartPhotoSession = () => {
    if (["idle", "finished", "error"].includes(sessionState)) setSessionState("template_strip_selection");
  };
  const handleTemplateStripSelect = (templateId) => {
    const selected = templates.find(t => t.id === templateId);
    if (!selected) return; // Jika template tidak ditemukan

    console.log(`[Trigger] Template ${templateId} selected. Photos needed: ${selected.photoCount}`);
    
    setSelectedTemplate(templateId);
    setActivePhotoCount(selected.photoCount); // <-- ATUR JUMLAH FOTO AKTIF DI SINI

    // Reset state lainnya untuk sesi baru
    setPhotos([]);
    setCurrentPhotoIndex(0);
    setCameraError(null);
    setCountdown(0);
    setQrCodeUrl("");
    setSessionState("starting_camera");
  };

  const resetSession = useCallback(() => {
    stopCamera();
    setSessionState("idle");
    setPhotos([]);
    setCurrentPhotoIndex(0);
    setQrCodeUrl("");
    setCameraError(null);
    setCountdown(0);
    setSelectedTemplate("template1");
  }, [stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // --- LOGIKA TEKS STATUS & STYLING ---
  let statusText = "";
  if (sessionState === "starting_camera") statusText = "Menyalakan kamera...";
  else if (sessionState === "camera_ready") statusText = "Kamera siap!";
  else if (sessionState === "countdown_to_capture")
    statusText = `Siap-siap Foto ${currentPhotoIndex + 1}... ${countdown}`;
  else if (sessionState === "capturing") statusText = `TERSENYUM!`;
  else if (sessionState === "inter_photo_countdown")
    statusText = `Foto ${currentPhotoIndex} selesai. Berikutnya: ${countdown}s`;
  else if (sessionState === "processing_server") statusText = "Memproses fotomu...";
  const cardClass = "bg-white/90 backdrop-blur-md p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-md sm:max-w-lg";

  return (
    <div className="min-h-screen w-full bg-rose-50 text-gray-800 flex flex-col items-center justify-center overflow-hidden px-4 py-8">
      {/* Header Navigasi Atas dengan Efek Frosted Glass */}
      <nav className="w-full fixed top-0 left-0 right-0 z-50 bg-rose-50/80 backdrop-blur-md border-b border-gray-200/60">
        <div className="max-w-screen-lg mx-auto p-4 sm:p-6 flex justify-between items-center">
          {/* Konten navigasi Anda (h1, div link, dll) tetap di sini */}
          <h1 className="text-xl sm:text-2xl font-bold text-pink-600">SIL GBIKT 2025</h1>
          <div className="text-sm text-gray-600 space-x-4 sm:space-x-6">
            <a href="#" className="hover:text-pink-600 transition-colors">
              Beranda
            </a>
            <a href="#" className="hover:text-pink-600 transition-colors">
              Cara penggunaan
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex flex-col items-center justify-center w-full max-w-screen-lg">
        {sessionState === "idle" && !qrCodeUrl && (
          <div className="relative text-center flex flex-col items-center justify-center w-full h-full animate-fadeInUp">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                <div className="w-64 h-64 sm:w-80 sm:h-80 bg-pink-300/30 rounded-full blur-3xl animate-pulse"></div>
            </div>
            <div className="relative z-10 flex flex-col items-center">
                <div className="flex items-center space-x-2 sm:space-x-3 mb-2 sm:mb-4">
                    <span className="text-xs sm:text-sm font-medium text-pink-500 tracking-wider">SIL</span>
                    <h2 className="text-5xl sm:text-7xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500">
                    keluargaku, rumahku
                    </h2>
                    <span className="text-xs sm:text-sm font-medium text-pink-500 tracking-wider">2025</span>
                </div>
                <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-10 max-w-xs sm:max-w-sm text-center">
                  Keluarga ku, Rumah ku: Tempat Tawa Menggema, Kasih Bersemi, Kenangan Tercipta.
                </p>
                 <div className="bg-white/70 backdrop-blur-md p-3 rounded-lg shadow-md text-xs text-gray-700 mb-8 max-w-sm text-left relative">
                    <span className="absolute -top-3 -left-3 bg-white p-1.5 rounded-full transform -rotate-12 shadow-md">
                      <span className="text-xl">📸</span>
                    </span>
                    <p className="text-sm text-center">Tekan tombol START, pilih desain strip, dan abadikan momen seru!</p>
                </div>
                <button
                    onClick={handleStartPhotoSession}
                    className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold py-3 sm:py-4 px-10 sm:px-16 rounded-full text-lg sm:text-xl shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 focus:outline-none focus:ring-4 focus:ring-pink-300"
                >
                    MULAI
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 inline-block ml-2">
                        <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
          </div>
        )}

        {/* Tampilan Pemilihan Template (Sekarang untuk 2 template) */}
        {sessionState === "template_strip_selection" && (
          <div className="w-full flex flex-col items-center p-4 animate-fadeInUp">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-700 mb-2 mt-10 text-center">Choose your layout</h2>
            <p className="text-sm text-gray-500 mb-10 text-center">
              NOTE: You have {PRE_CAPTURE_COUNTDOWN} seconds for each shot.
            </p>

            {/* Grid untuk 2 Layout Template */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-xl">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`bg-white rounded-xl shadow-lg p-3 cursor-pointer transition-all duration-300 ease-in-out w-full hover:shadow-2xl hover:-translate-y-2 ${
                    selectedTemplate === template.id ? "ring-4 ring-pink-500" : "ring-1 ring-gray-200"
                  }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <div className="w-full aspect-[2/3] bg-gray-100 rounded-md mb-4 overflow-hidden">
                    <img
                      src={template.previewUrl}
                      alt={template.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://via.placeholder.com/200x300?text=Error";
                      }}
                    />
                  </div>
                  <h3 className="font-semibold text-gray-800 text-center text-lg">{template.name}</h3>
                  <p className="text-xs text-gray-500 text-center mt-1">{template.description}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md mt-10">
              <button
                onClick={resetSession}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg shadow-sm transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={() => handleTemplateStripSelect(selectedTemplate)}
                disabled={!selectedTemplate}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Lanjutkan
              </button>
            </div>
          </div>
        )}

        {/* Modal untuk Proses Sesi Foto */}
        {!["idle", "template_strip_selection"].includes(sessionState) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-fadeInUp">
            <div className={`${cardClass} text-gray-800 text-center space-y-4`}>
              <div
                className={
                  (sessionState === "starting_camera" ||
                    sessionState === "camera_ready" ||
                    sessionState === "countdown_to_capture" ||
                    sessionState === "capturing" ||
                    sessionState === "inter_photo_countdown") &&
                  !cameraError
                    ? "block"
                    : "hidden"
                }
              >
                <div className="w-full aspect-[4/3] bg-gray-900 rounded-lg overflow-hidden shadow-lg mx-auto max-w-sm border-4 border-white">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
                  <canvas ref={canvasRef} className="hidden"></canvas>
                  {sessionState === "capturing" && (
                    <div className="absolute inset-0 bg-white opacity-75 animate-pulse"></div>
                  )}
                </div>
              </div>

              {(sessionState === "starting_camera" || sessionState === "camera_ready") && !cameraError && (
                <>
                  <p className="text-xl font-semibold">{statusText}</p>
                  {sessionState === "starting_camera" && (
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500 mx-auto my-4"></div>
                  )}
                </>
              )}
              {(sessionState === "countdown_to_capture" ||
                sessionState === "capturing" ||
                sessionState === "inter_photo_countdown") &&
                !cameraError && (
                  <>
                    <p className="text-2xl sm:text-3xl font-bold h-10">{statusText}</p>
                    <p className="text-md text-gray-600">
                      Foto {currentPhotoIndex < activePhotoCount ? currentPhotoIndex + 1 : activePhotoCount} dari {activePhotoCount}
                    </p>
                    {sessionState !== "capturing" && sessionState !== "countdown_to_capture" && (
                      <button
                        onClick={resetSession}
                        className="bg-gray-200 hover:bg-gray-300 font-semibold py-2 px-4 rounded-lg text-sm shadow"
                      >
                        Batalkan
                      </button>
                    )}
                  </>
                )}
              {sessionState === "processing_server" && !cameraError && (
                <>
                  <p className="text-xl font-semibold">{statusText}</p>
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500 mx-auto my-4"></div>
                  <p className="text-md text-gray-600">Mohon tunggu...</p>
                </>
              )}
              {sessionState === "error" && (
                <>
                  <h3 className="text-xl font-semibold text-red-600">Oops, Terjadi Masalah!</h3>
                  <p className="text-gray-700">{cameraError || "Terjadi kesalahan."}</p>
                  <button
                    onClick={resetSession}
                    className="w-full mt-4 bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2.5 px-4 rounded-lg shadow"
                  >
                    Kembali
                  </button>
                </>
              )}
              {sessionState === "finished" && qrCodeUrl && (
                <>
                  <h2 className="text-2xl sm:text-3xl font-semibold">Yeay, Foto Selesai!</h2>
                  <p className="text-gray-600">Scan QR code ini untuk melihat fotomu.</p>
                  <div className="flex justify-center my-3">
                    <img
                      src={qrCodeUrl}
                      alt="QR Code"
                      className="w-48 h-48 border-4 border-gray-100 rounded-lg shadow-md"
                    />
                  </div>
                  {photos.length > 0 && (
                    <div className="pt-1">
                      <p className="text-xs text-gray-500 mb-1">Preview:</p>
                      <div className={`grid grid-cols-2 gap-1.5`}>
                        {photos.map((photoSrc, index) => (
                          <img
                            key={index}
                            src={photoSrc}
                            alt={`Foto ${index + 1}`}
                            className="w-full rounded shadow-sm object-cover aspect-square bg-gray-200"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    onClick={resetSession}
                    className="w-full mt-4 bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow"
                  >
                    Ambil Foto Lagi
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>
      <footer className="w-full p-4 text-center mt-auto">
        <p className="text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Photobooth SIL GBIKT. All rights reserved.
        </p>
      </footer>
      {/* <canvas ref={finalStripCanvasRef} className="hidden"></canvas> */}
    </div>
  );
}
