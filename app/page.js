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
  // idle, template_strip_selection, starting_camera, camera_ready,
  // countdown_to_capture, capturing, inter_photo_countdown,
  // processing_server, finished, error
  const [photos, setPhotos] = useState([]);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0); // Foto yang AKAN diambil (0, 1, 2)
  const [cameraError, setCameraError] = useState(null);

  // --- REFS ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // --- DATA TEMPLATE (SESUAIKAN DENGAN DESAIN DAN FILE ANDA) ---
  const templates = [
    {
      id: "template1",
      name: "Layout A",
      previewUrl: "/assets/template1.png",
      description: "Size 6x2 Strip (3 Pose)",
    },
    {
      id: "template2",
      name: "Layout B",
      previewUrl: "/assets/template2.png",
      description: "Size 6x2 Strip (4 Pose)",
    },
    {
      id: "template3",
      name: "Layout C",
      previewUrl: "/templates/layout-c-preview.png",
      description: "Size 6x2 Strip (2 Pose)",
    },
  ];

  const clearCountdownInterval = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
      console.log("[Interval] Cleared countdown interval.");
    }
  }, []);

  const startCamera = useCallback(async () => {
    console.log("[Camera] Attempting to start camera...");
    setCameraError(null);
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise((resolve, reject) => {
            if (videoRef.current) {
              videoRef.current.onloadedmetadata = () => {
                console.log("[Camera] Metadata loaded.");
                resolve();
              };
              setTimeout(() => reject(new Error("Camera metadata load timeout")), 5000);
            } else {
              reject(new Error("videoRef is null"));
            }
          });
          setSessionState("camera_ready");
          console.log("[Camera] Started successfully, state set to camera_ready.");
          return true;
        }
      } catch (err) {
        console.error("[Camera] Error accessing camera: ", err);
        let errorMsg = `Error kamera: ${err.message}`;
        if (err.name === "NotAllowedError") errorMsg = "Izin kamera ditolak.";
        else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")
          errorMsg = "Tidak ada kamera ditemukan.";
        setCameraError(errorMsg);
        setSessionState("error");
        return false;
      }
    } else {
      setCameraError("Browser Anda tidak mendukung akses kamera.");
      setSessionState("error");
      console.log("[Camera] getUserMedia not supported.");
      return false;
    }
    return false;
  }, []);

  const stopCamera = useCallback(() => {
    console.log("[Camera] Stopping camera.");
    clearCountdownInterval();
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      console.log("[Camera] Stream stopped.");
    }
  }, [clearCountdownInterval]);

  const captureFrame = useCallback(() => {
    console.log("[Capture] Attempting to capture frame.");
    if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 3 && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg");
      setPhotos((prevPhotos) => {
        if (
          prevPhotos.length >= TOTAL_PHOTOS &&
          (sessionState === "capturing" || sessionState === "inter_photo_countdown")
        ) {
          console.warn(
            `[Capture] Attempted to add photo beyond TOTAL_PHOTOS (${TOTAL_PHOTOS}). Current count: ${prevPhotos.length}. Photo not added.`
          );
          return prevPhotos;
        }
        const newPhotos = [...prevPhotos, dataUrl];
        console.log(`[Capture] Frame captured. Total photos in array now: ${newPhotos.length}`);
        return newPhotos;
      });
      return dataUrl;
    }
    console.warn("[Capture] Failed. Video not ready or ref not available.");
    return null;
  }, [sessionState]);

  const processPhotosAndGetQR = useCallback(async (capturedPhotos, templateId) => {
    console.log("[API] Processing photos and getting QR for template:", templateId);
    try {
      const response = await fetch("/api/photobox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: capturedPhotos, selectedTemplate: templateId }),
      });
      const result = await response.json();
      if (!response.ok) {
        console.error("[API] Error from server:", result.message);
        throw new Error(result.message || "Gagal memproses foto di server.");
      }
      console.log("[API] Success. Result:", result);
      return result;
    } catch (error) {
      console.error("[API] Error calling API route:", error);
      setCameraError(`Gagal menghubungi server: ${error.message}`);
      setSessionState("error");
      return null;
    }
  }, []);

  const proceedToNextStep = useCallback(() => {
    clearCountdownInterval();
    console.log(
      `[Session Flow] proceedToNextStep called. currentPhotoIndex (foto yang AKAN diambil): ${currentPhotoIndex}`
    );
    if (currentPhotoIndex < TOTAL_PHOTOS) {
      setSessionState("countdown_to_capture");
      setCountdown(PRE_CAPTURE_COUNTDOWN);
      console.log(`[Session Flow] Starting ${PRE_CAPTURE_COUNTDOWN}s countdown for photo ${currentPhotoIndex + 1}.`);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prevCd) => {
          if (prevCd <= 1) {
            clearCountdownInterval();
            console.log(
              `[Session Flow] Countdown finished for photo ${currentPhotoIndex + 1}. Setting state to 'capturing'.`
            );
            setSessionState("capturing");
            return 0;
          }
          return prevCd - 1;
        });
      }, 1000);
    } else {
      console.warn(
        "[Session Flow] proceedToNextStep called when currentPhotoIndex >= TOTAL_PHOTOS. Should transition via Effect Hook 1."
      );
      setSessionState("processing_server");
    }
  }, [currentPhotoIndex, clearCountdownInterval]);

  // --- USEEFFECT HOOKS (PASTIKAN INI ADALAH IMPLEMENTASI LENGKAP DAN BENAR DARI SISI ANDA) ---

  useEffect(() => {
    // Effect Hook 1: Transisi dari 'capturing'
    console.log(
      `[Effect Hook 1] sessionState: ${sessionState}, currentPhotoIndex: ${currentPhotoIndex}, photos.length: ${photos.length}`
    );
    if (sessionState === "capturing") {
      if (currentPhotoIndex < TOTAL_PHOTOS) {
        captureFrame();
        const newPhotoIndexAfterCapture = currentPhotoIndex + 1;
        setCurrentPhotoIndex(newPhotoIndexAfterCapture);
        console.log(
          `[Effect Hook 1 - 'capturing'] Photo ${
            currentPhotoIndex + 1
          } (sebelumnya) captured. Index is now ${newPhotoIndexAfterCapture}.`
        );
        if (newPhotoIndexAfterCapture < TOTAL_PHOTOS) {
          setSessionState("inter_photo_countdown");
          setCountdown(INTER_PHOTO_DELAY);
          clearCountdownInterval();
          countdownIntervalRef.current = setInterval(() => {
            setCountdown((prevCd) => {
              if (prevCd <= 1) {
                clearCountdownInterval();
                proceedToNextStep();
                return 0;
              }
              return prevCd - 1;
            });
          }, 1000);
        } else {
          setSessionState("processing_server");
        }
      } else {
        console.warn(
          `[Effect Hook 1 - 'capturing'] State is 'capturing' but currentPhotoIndex (${currentPhotoIndex}) is not less than TOTAL_PHOTOS. Resetting.`
        );
        setSessionState("error");
        setCameraError("Terjadi kesalahan internal pada urutan foto.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]); // Bergantung pada sessionState. Fungsi lain dipanggil, pastikan useCallback sudah benar.

  useEffect(() => {
    // Effect Hook 2: Reset dan mulai kamera
    if (sessionState === "starting_camera") {
      // Reset state inti sudah dilakukan di handleTemplateStripSelect atau handleStartPhotoSession
      // yang mengarah ke 'starting_camera' setelah pemilihan template.
      console.log("[Effect Hook 2] State 'starting_camera'. Calling startCamera.");
      startCamera();
    }
  }, [sessionState, startCamera]);

  useEffect(() => {
    // Effect Hook 3: Mulai sesi foto setelah kamera siap
    if (sessionState === "camera_ready") {
      console.log("[Effect Hook 3] State 'camera_ready'. Calling proceedToNextStep.");
      proceedToNextStep();
    }
  }, [sessionState, proceedToNextStep]);

  useEffect(() => {
    // Effect Hook 4: Panggil API
    const completeAndCallApi = async () => {
      stopCamera();
      console.log("[Effect Hook 4] Photos for API:", photos);
      const apiResult = await processPhotosAndGetQR(photos, selectedTemplate);
      if (apiResult) {
        setQrCodeUrl(apiResult.qrCodeUrl);
        setSessionState("finished");
      }
    };
    if (sessionState === "processing_server") {
      if (photos.length === TOTAL_PHOTOS) {
        console.log(`[Effect Hook 4] Correct photo count (${photos.length}). Calling API.`);
        completeAndCallApi();
      } else {
        console.warn(`[Effect Hook 4] Incorrect photo count. Needed: ${TOTAL_PHOTOS}, Have: ${photos.length}.`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, photos, selectedTemplate, stopCamera, processPhotosAndGetQR]);

  // --- FUNGSI HANDLER ---
  const handleStartPhotoSession = () => {
    // Dari tombol START utama
    if (sessionState === "idle" || sessionState === "finished" || sessionState === "error") {
      console.log("[Trigger] handleStartPhotoSession (from landing). To template_strip_selection.");
      setPhotos([]);
      setCurrentPhotoIndex(0);
      setQrCodeUrl("");
      setCameraError(null);
      setCountdown(0);
      // setSelectedTemplate("template1"); // Biarkan template terakhir, atau reset
      setSessionState("template_strip_selection");
    } else {
      console.warn("[Trigger] Start (from landing) aborted. Session state:", sessionState);
    }
  };

  const handleTemplateStripSelect = (templateId) => {
    console.log(`[Trigger] Template strip ${templateId} selected. To starting_camera.`);
    setSelectedTemplate(templateId);
    setPhotos([]);
    setCurrentPhotoIndex(0);
    setQrCodeUrl("");
    setCameraError(null);
    setCountdown(0);
    setSessionState("starting_camera");
  };

  const resetSession = useCallback(() => {
    console.log("[Trigger] resetSession called. To idle.");
    stopCamera();
    setSessionState("idle");
    // State lain direset saat handleStartPhotoSession jika sesi baru dimulai
    // Atau reset eksplisit di sini jika diperlukan:
    setPhotos([]);
    setCurrentPhotoIndex(0);
    setQrCodeUrl("");
    setCameraError(null);
    setCountdown(0);
    setSelectedTemplate("template1");
  }, [stopCamera]);

  useEffect(() => {
    // Cleanup utama komponen
    return () => {
      console.log("[Lifecycle] HomePage unmounting. Cleaning up.");
      stopCamera();
    };
  }, [stopCamera]);

  // --- LOGIKA TEKS STATUS ---
  let statusText = "";
  if (sessionState === "starting_camera") statusText = "Menyalakan kamera...";
  else if (sessionState === "camera_ready") statusText = "Kamera siap! Memulai...";
  else if (sessionState === "countdown_to_capture")
    statusText = `Siap-siap Foto ${currentPhotoIndex + 1}... ${countdown}`;
  else if (sessionState === "capturing") statusText = `TERSENYUM! Foto ${currentPhotoIndex + 1}`;
  else if (sessionState === "inter_photo_countdown")
    statusText = `Foto ${currentPhotoIndex} selesai. Berikutnya: ${countdown}s`;
  else if (sessionState === "processing_server") statusText = "Memproses fotomu...";

  // --- KELAS STYLING ---
  const cardClass = "bg-white/80 backdrop-blur-lg p-6 sm:p-8 rounded-2xl shadow-xl w-full max-w-md sm:max-w-lg";

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-pink-100 via-rose-50 to-fuchsia-100 text-gray-800 flex flex-col items-center justify-center overflow-hidden px-4 py-8">
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

      <main className="flex-grow flex flex-col items-center justify-center w-full max-w-screen-lg pt-16">
        {sessionState === "idle" && !qrCodeUrl && (
          <div className="relative text-center flex flex-col items-center justify-center w-full h-full animate-fadeInUp">
            {/* Ganti src dengan path ke gambar hiasan Anda di folder public */}
            {/* <img
              src="/assets/preview1.png"
              alt="Contoh photostrip"
              className="absolute left-4 sm:left-10 md:left-20 top-1/2 -translate-y-1/2 w-24 sm:w-32 md:w-40 opacity-60 transform -rotate-12 hidden lg:block pointer-events-none select-none"
            />
            <img
              src="/templates/strip-sample-2.png"
              alt="Contoh photostrip"
              className="absolute right-4 sm:right-10 md:right-20 top-1/2 -translate-y-1/2 w-24 sm:w-32 md:w-40 opacity-60 transform rotate-12 hidden lg:block pointer-events-none select-none"
            /> */}

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
                <p className="text-sm text-center">
                  Tekan tombol START, pilih desain strip, dan abadikan momen seru keluargamu!
                </p>
              </div>
              <button
                onClick={handleStartPhotoSession}
                className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold py-3 sm:py-4 px-10 sm:px-16 rounded-full text-lg sm:text-xl shadow-lg transform transition-all duration-300 ease-in-out hover:scale-105 focus:outline-none focus:ring-4 focus:ring-pink-300"
              >
                START
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 inline-block ml-2"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {sessionState === "template_strip_selection" && (
          <div className="w-full flex flex-col items-center p-4 animate-fadeInUp fixed inset-0 bg-black/30 backdrop-blur-sm justify-center z-40">
            {/* Ganti max-w-2xl menjadi max-w-4xl atau max-w-3xl */}
            <div className={`${cardClass} max-w-3xl lg:max-w-4xl space-y-5`}>
              {" "}
              {/* Coba max-w-3xl, atau 4xl untuk lebih lebar lagi di layar besar */}
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-700 mb-5 text-center">
                Pilih Template Strip {/* Sesuai screenshot Anda */}
              </h2>
              {/* Pastikan 'templates' array Anda memiliki data yang benar, terutama 'previewUrl' atau 'stripPreviewUrl' */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full pt-2">
                {" "}
                {/* Tetap 3 kolom di sm ke atas, gap bisa disesuaikan */}
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`bg-white rounded-xl shadow-md p-3 cursor-pointer transition-all duration-300 ease-in-out 
                                hover:shadow-xl hover:-translate-y-1
                                ${selectedTemplate === template.id}`}
                    onClick={() => handleTemplateStripSelect(template.id)}
                  >
                    {/* Pastikan gambar preview Anda memiliki rasio yang baik untuk strip */}
                    <div className="w-full aspect-[1/2] sm:aspect-[9/16] md:aspect-[2/3] bg-gray-100 rounded-md mb-3 overflow-hidden flex items-center justify-center">
                      {" "}
                      {/* Sesuaikan aspect ratio di sini jika perlu */}
                      <img
                        src={template.stripPreviewUrl || template.previewUrl}
                        alt={`Preview ${template.name}`}
                        className="w-full h-full object-contain sm:object-cover"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "https://via.placeholder.com/150x300?text=Preview Error";
                        }}
                      />
                    </div>
                    <h3 className="font-semibold text-gray-700 text-center text-sm sm:text-base">{template.name}</h3>
                    <p className="text-xs text-gray-500 text-center mt-1">{template.description}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-center text-gray-500 pt-1">
                Desain terpilih:{" "}
                <span className="font-semibold text-pink-600">
                  {templates.find((t) => t.id === selectedTemplate)?.name || "-"}
                </span>
              </p>
              <button
                onClick={resetSession}
                className="w-full mt-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-lg text-sm shadow focus:outline-none focus:ring-1 focus:ring-gray-300 transition-colors"
              >
                Kembali ke Halaman Utama
              </button>
            </div>
          </div>
        )}

        {/* Modal untuk Sesi Foto, QR, Error (selain template selection) */}
        {(sessionState === "starting_camera" ||
          sessionState === "camera_ready" ||
          sessionState === "countdown_to_capture" ||
          sessionState === "capturing" ||
          sessionState === "inter_photo_countdown" ||
          sessionState === "processing_server" ||
          (sessionState === "error" && sessionState !== "template_strip_selection") || // Error umum
          (sessionState === "finished" && qrCodeUrl)) &&
          sessionState !== "template_strip_selection" && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-40 transition-opacity duration-300 ease-in-out animate-fadeInUp">
              <div className={`${cardClass} text-center space-y-4`}>
                {(sessionState === "starting_camera" || (sessionState === "camera_ready" && !cameraError)) && (
                  <>
                    <p className="text-xl text-gray-700">{statusText}</p>
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500 mx-auto"></div>
                  </>
                )}

                {(sessionState === "countdown_to_capture" ||
                  sessionState === "capturing" ||
                  sessionState === "inter_photo_countdown") &&
                  !cameraError && (
                    <>
                      <div className="w-full aspect-[4/3] bg-gray-800 rounded-lg overflow-hidden shadow-lg mx-auto max-w-xs sm:max-w-sm border-4 border-white">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                        <canvas ref={canvasRef} className="hidden"></canvas>
                        {sessionState === "capturing" && (
                          <div className="absolute inset-0 bg-white opacity-75 animate-pulse"></div>
                        )}
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-gray-800 h-10">{statusText}</p>
                      <p className="text-md text-gray-600">
                        {currentPhotoIndex < TOTAL_PHOTOS
                          ? `Foto ${currentPhotoIndex + 1} dari ${TOTAL_PHOTOS}`
                          : `Selesai ${TOTAL_PHOTOS} foto!`}
                      </p>
                      <button
                        onClick={resetSession}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm shadow"
                      >
                        Batalkan
                      </button>
                    </>
                  )}

                {sessionState === "processing_server" && !cameraError && (
                  <>
                    <p className="text-xl text-gray-700">{statusText}</p>
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-500 mx-auto"></div>
                    <p className="text-md text-gray-600">Mohon tunggu sebentar...</p>
                  </>
                )}

                {sessionState === "error" && (
                  <>
                    <h3 className="text-xl font-semibold text-red-600">Oops, Terjadi Masalah!</h3>
                    <p className="text-gray-700">{cameraError || "Terjadi kesalahan tidak diketahui."}</p>
                    <button
                      onClick={resetSession}
                      className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2.5 px-4 rounded-lg shadow"
                    >
                      Kembali
                    </button>
                  </>
                )}

                {sessionState === "finished" && qrCodeUrl && (
                  <>
                    <h2 className="text-2xl sm:text-3xl font-semibold text-gray-800">Yeay, Foto Selesai!</h2>
                    <p className="text-gray-600">Scan QR code ini untuk melihat dan mengunduh fotomu.</p>
                    <div className="flex justify-center my-3">
                      <img
                        src={qrCodeUrl}
                        alt="QR Code"
                        className="w-40 h-40 sm:w-48 sm:h-48 border-4 border-gray-100 rounded-lg shadow-md"
                      />
                    </div>
                    {photos.length > 0 && (
                      <div className="pt-1">
                        <p className="text-xs text-gray-500 mb-1">Preview:</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {photos.map((photoSrc, index) => (
                            <img
                              key={index}
                              src={photoSrc}
                              alt={`Foto ${index + 1}`}
                              className="w-full h-auto rounded shadow-sm object-cover aspect-square bg-gray-200"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={resetSession}
                      className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow"
                    >
                      Ambil Foto Lagi
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
      </main>
      <footer className="w-full p-4 text-center mt-auto fixed bottom-0 left-0 right-0 z-30 hidden sm:block">
        <p className="text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Photobooth SIL GBIKT. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
