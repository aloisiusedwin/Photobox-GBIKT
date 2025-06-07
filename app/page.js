// src/app/page.js
"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// Konfigurasi Sesi Foto
const PRE_CAPTURE_COUNTDOWN = 3;
const INTER_PHOTO_DELAY = 8;
const TOTAL_PHOTOS = 2;

export default function HomePage() {
  // --- STATE MANAGEMENT ---
  const [selectedTemplate, setSelectedTemplate] = useState("template1");
  const [sessionState, setSessionState] = useState("idle");
  const [photos, setPhotos] = useState([]);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [cameraError, setCameraError] = useState(null);

  // --- REFS ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // --- DATA TEMPLATE (SEKARANG HANYA 2 TEMPLATE) ---
  const templates = [
    {
      id: "template1",
      name: "Layout A",
      previewUrl: "/templates/template1.png", // Pastikan file ada di public/templates/
      description: "Size 6x2 Strip (2 Pose)",
    },
    {
      id: "template2",
      name: "Layout B",
      previewUrl: "/templates/template2.png", // Pastikan file ada di public/templates/
      description: "Size 6x2 Strip (2 Pose)",
    },
  ];

  // --- FUNGSI-FUNGSI INTI ---
  const clearCountdownInterval = useCallback(() => {
    /* ... (Logika sama seperti sebelumnya) ... */ if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);
  const startCamera = useCallback(async () => {
    /* ... (Logika sama seperti sebelumnya) ... */ if (!videoRef.current) {
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
    /* ... (Logika sama seperti sebelumnya) ... */ clearCountdownInterval();
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, [clearCountdownInterval]);
  const captureFrame = useCallback(() => {
    /* ... (Logika sama seperti sebelumnya) ... */ if (photos.length >= TOTAL_PHOTOS) return;
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
    if (currentPhotoIndex < TOTAL_PHOTOS) {
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
      if (newIdx < TOTAL_PHOTOS) {
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
    if (sessionState === "processing_server" && photos.length === TOTAL_PHOTOS) upload();
  }, [sessionState, photos, selectedTemplate, processPhotosAndGetQR, stopCamera]);

  // --- FUNGSI HANDLER ---
  const handleStartPhotoSession = () => {
    if (["idle", "finished", "error"].includes(sessionState)) setSessionState("template_strip_selection");
  };
  const handleTemplateStripSelect = (templateId) => {
    setSelectedTemplate(templateId);
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
          <div className="text-center animate-fadeInUp">
            <h2 className="text-6xl font-extrabold mb-4 text-pink-500">Photobooth</h2>
            <p className="mb-8 text-lg text-gray-600">Keluarga ku, Rumah ku: Abadikan Kehangatan Kita.</p>
            <button
              onClick={handleStartPhotoSession}
              className="bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 px-10 rounded-full text-lg shadow-lg transition-transform transform hover:scale-105"
            >
              MULAI
            </button>
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
                      Foto {currentPhotoIndex < TOTAL_PHOTOS ? currentPhotoIndex + 1 : TOTAL_PHOTOS} dari {TOTAL_PHOTOS}
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
