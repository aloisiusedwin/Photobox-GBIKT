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
  const finalStripCanvasRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // --- DATA TEMPLATE (WAJIB ANDA ISI DENGAN DATA YANG AKURAT!) ---
  const templates = [
    {
      id: "template1",
      name: "Layout A",
      previewUrl: "/templates/template1.png", // Pindahkan gambar ke public/templates/
      description: "Size 6x2 Strip (2 Pose)",
    },
    {
      id: "template2",
      name: "Layout B",
      previewUrl: "/templates/template2.png",
      description: "Size 6x2 Strip (2 Pose)",
    },
    {
      id: "template3",
      name: "Layout C",
      previewUrl: "/templates/template3.png",
      description: "Size 6x2 Strip (2 Pose)",
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
      setCameraError("Gagal menginisialisasi elemen video kamera.");
      setSessionState("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve, reject) => {
          const videoEl = videoRef.current;
          if (!videoEl) return reject(new Error("Video element gone"));
          const onLoaded = () => resolve();
          videoEl.addEventListener("loadedmetadata", onLoaded, { once: true });
          setTimeout(() => reject(new Error("Timeout waiting for metadata")), 5000);
        });
        setSessionState("camera_ready");
      }
    } catch (err) {
      let errorMsg = `Error kamera: ${err.message}`;
      if (err.name === "NotAllowedError") errorMsg = "Izin kamera ditolak.";
      else if (err.name === "NotFoundError") errorMsg = "Kamera tidak ditemukan.";
      setCameraError(errorMsg);
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
    if (photos.length >= TOTAL_PHOTOS) return;
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setPhotos((prev) => [...prev, dataUrl]);
    }
  }, [photos.length]);

  const processPhotosAndGetQR = useCallback(
    async (capturedPhotos, templateId) => {
      try {
        const response = await fetch("/api/photobox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photos: capturedPhotos, selectedTemplate: templateId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Gagal di server API.");
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
    clearCountdownInterval();
    if (currentPhotoIndex < TOTAL_PHOTOS) {
      setSessionState("countdown_to_capture");
      setCountdown(PRE_CAPTURE_COUNTDOWN);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((cd) => {
          if (cd <= 1) {
            clearCountdownInterval();
            setSessionState("capturing");
            return 0;
          }
          return cd - 1;
        });
      }, 1000);
    } else {
      setSessionState("processing_server"); // Setelah semua foto diambil
    }
  }, [currentPhotoIndex, clearCountdownInterval]);

  // --- USEEFFECT HOOKS ---

  // Effect Hook 1: Transisi setelah foto di-capture
  useEffect(() => {
    if (sessionState === "capturing") {
      captureFrame();
      const newIdx = currentPhotoIndex + 1;
      setCurrentPhotoIndex(newIdx);
      if (newIdx < TOTAL_PHOTOS) {
        setSessionState("inter_photo_countdown");
        setCountdown(INTER_PHOTO_DELAY);
        clearCountdownInterval();
        countdownIntervalRef.current = setInterval(() => {
          setCountdown((cd) => {
            if (cd <= 1) {
              clearCountdownInterval();
              proceedToNextStep();
              return 0;
            }
            return cd - 1;
          });
        }, 1000);
      } else {
        setSessionState("processing_server");
      }
    }
  }, [sessionState, currentPhotoIndex, captureFrame, clearCountdownInterval, proceedToNextStep]);

  // Effect Hook 2: Memanggil startCamera HANYA JIKA ref sudah ada
  useEffect(() => {
    if (sessionState === "starting_camera") {
      if (videoRef.current) {
        startCamera();
      }
    }
  }, [sessionState, startCamera]);

  // Effect Hook 3: Mulai sesi foto setelah kamera siap
  useEffect(() => {
    if (sessionState === "camera_ready") {
      proceedToNextStep();
    }
  }, [sessionState, proceedToNextStep]);

  // Effect Hook 4: Upload ke server setelah semua foto diambil
  useEffect(() => {
    const uploadAndFinish = async () => {
      stopCamera();
      const apiResult = await processPhotosAndGetQR(photos, selectedTemplate);
      if (apiResult) {
        setQrCodeUrl(apiResult.qrCodeUrl);
        setSessionState("finished");
      }
    };
    if (sessionState === "processing_server" && photos.length === TOTAL_PHOTOS) {
      uploadAndFinish();
    }
  }, [sessionState, photos, selectedTemplate, processPhotosAndGetQR, stopCamera]); // PERBAIKAN: processPhotosAndGetQR ditambahkan di sini

  // --- FUNGSI HANDLER ---
  const handleStartPhotoSession = () => {
    if (["idle", "finished", "error"].includes(sessionState)) {
      setSessionState("template_strip_selection");
    }
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

  // --- CLEANUP EFFECT ---
  useEffect(() => {
    return () => {
      stopCamera();
    };
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
    <div className="min-h-screen w-full bg-pink-50 text-gray-800 flex flex-col items-center justify-center overflow-hidden px-4 py-8">
      <nav className="w-full max-w-screen-lg mx-auto p-4 fixed top-0 left-0 right-0 z-50 flex justify-between items-center">
        <h1 className="text-xl sm:text-2xl font-bold text-pink-600">SIL GBIKT 2025</h1>
        <div className="text-sm text-gray-600 space-x-4 sm:space-x-6">
          <a href="#" className="hover:text-pink-600 transition-colors">
            Beranda
          </a>
          <a href="#" className="hover:text-pink-600 transition-colors">
            Cara penggunaan
          </a>
        </div>
      </nav>

      <main className="flex-grow flex flex-col items-center justify-center w-full max-w-screen-lg">
        {sessionState === "idle" && !qrCodeUrl && (
          <div className="text-center animate-fadeInUp">
            <h2 className="text-5xl font-extrabold mb-4 text-pink-600">Photobooth Keluarga</h2>
            <p className="mb-8 text-lg text-gray-600">Keluarga ku, Rumah ku: Abadikan Kehangatan Kita.</p>
            <button
              onClick={handleStartPhotoSession}
              className="bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 px-10 rounded-full text-lg shadow-lg transition-transform transform hover:scale-105"
            >
              MULAI
            </button>
          </div>
        )}

        {sessionState === "template_strip_selection" && (
          <div className="w-full flex flex-col items-center p-4 animate-fadeInUp fixed inset-0 bg-black/30 backdrop-blur-sm justify-center z-40">
            <div className={`${cardClass} max-w-3xl lg:max-w-4xl space-y-5 text-gray-800`}>
              <h2 className="text-2xl sm:text-3xl font-bold text-center">Pilih Template Strip</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full pt-2">
                {templates.slice(0, 3).map((template) => (
                  <div
                    key={template.id}
                    className={`bg-white rounded-xl shadow-md p-3 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                      selectedTemplate === template.id ? "ring-4 ring-pink-500" : "ring-1 ring-gray-200"
                    }`}
                    onClick={() => handleTemplateStripSelect(template.id)}
                  >
                    <div className="w-full aspect-[2/3] bg-gray-100 rounded-md mb-3 overflow-hidden">
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
                    <h3 className="font-semibold text-center text-sm sm:text-base">{template.name}</h3>
                    <p className="text-xs text-gray-500 text-center mt-1">{template.description}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={resetSession}
                className="w-full mt-3 bg-gray-100 hover:bg-gray-200 font-semibold py-2.5 px-4 rounded-lg text-sm shadow"
              >
                Kembali
              </button>
            </div>
          </div>
        )}

        {!["idle", "template_strip_selection"].includes(sessionState) && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-fadeInUp">
            <div className={`${cardClass} text-center space-y-4 text-gray-800`}>
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
                  <p className="text-md text-gray-600">Mohon tunggu sebentar...</p>
                </>
              )}

              {sessionState === "error" && (
                <>
                  <h3 className="text-xl font-semibold text-red-600">Oops, Terjadi Masalah!</h3>
                  <p className="text-gray-700">{cameraError || "Terjadi kesalahan tidak diketahui."}</p>
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
      <canvas ref={finalStripCanvasRef} className="hidden"></canvas>
    </div>
  );
}
