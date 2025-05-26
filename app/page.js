// src/app/page.js
"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const PRE_CAPTURE_COUNTDOWN = 3;
const INTER_PHOTO_DELAY = 8;
const TOTAL_PHOTOS = 3;

export default function HomePage() {
  const [selectedTemplate, setSelectedTemplate] = useState("template1");
  const [sessionState, setSessionState] = useState("idle");
  const [photos, setPhotos] = useState([]);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const templates = [
    { id: "template1", name: "Template Klasik", previewUrl: "/templates/classic-preview.png" },
    { id: "template2", name: "Template Fun", previewUrl: "/templates/fun-preview.png" },
    { id: "template3", name: "Template Elegan", previewUrl: "/templates/elegant-preview.png" },
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
    // sessionState sudah diatur ke 'starting_camera' oleh pemanggil
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
          setSessionState("camera_ready"); // State baru menandakan kamera siap
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
        if (prevPhotos.length >= TOTAL_PHOTOS && sessionState !== "idle" && sessionState !== "finished") {
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
    console.log(`[Session Flow] proceedToNextStep called. currentPhotoIndex: ${currentPhotoIndex}`);

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
      console.log("[Session Flow] All photos processed for capture. Transitioning to 'processing_server'.");
      setSessionState("processing_server");
    }
  }, [currentPhotoIndex, clearCountdownInterval]);

  useEffect(() => {
    console.log(
      `[Effect Hook 1] Triggered. sessionState: ${sessionState}, currentPhotoIndex (before action): ${currentPhotoIndex}, photos.length: ${photos.length}`
    );
    if (sessionState === "capturing") {
      if (currentPhotoIndex < TOTAL_PHOTOS) {
        console.log(`[Effect Hook 1 - 'capturing'] Capturing photo ${currentPhotoIndex + 1}.`);
        captureFrame();

        const newPhotoIndex = currentPhotoIndex + 1;
        setCurrentPhotoIndex(newPhotoIndex);
        console.log(
          `[Effect Hook 1 - 'capturing'] Photo ${
            currentPhotoIndex + 1 // Ini akan menampilkan index lama karena log sebelum setCurrentPhotoIndex efektif
          } captured. Index incremented to ${newPhotoIndex}.`
        );

        if (newPhotoIndex < TOTAL_PHOTOS) {
          console.log(`[Effect Hook 1 - 'capturing'] Transitioning to 'inter_photo_countdown'.`);
          setSessionState("inter_photo_countdown");
          setCountdown(INTER_PHOTO_DELAY);
          clearCountdownInterval();
          countdownIntervalRef.current = setInterval(() => {
            setCountdown((prevCd) => {
              if (prevCd <= 1) {
                clearCountdownInterval();
                console.log("[Effect Hook 1 - interval] Inter-photo delay finished. Calling proceedToNextStep.");
                proceedToNextStep();
                return 0;
              }
              return prevCd - 1;
            });
          }, 1000);
        } else {
          console.log(
            "[Effect Hook 1 - 'capturing'] Last photo captured by sequence. Transitioning to 'processing_server'."
          );
          setSessionState("processing_server");
        }
      } else {
        console.warn(
          `[Effect Hook 1 - 'capturing'] Aborted capture. currentPhotoIndex (${currentPhotoIndex}) not less than TOTAL_PHOTOS (${TOTAL_PHOTOS}). This may indicate an issue.`
        );
        setSessionState("error");
        setCameraError("Terjadi kesalahan dalam urutan pengambilan foto.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, captureFrame, clearCountdownInterval, proceedToNextStep]); // currentPhotoIndex dikeluarkan untuk menghindari re-trigger yang tidak perlu karena diupdate di dalam effect ini.

  useEffect(() => {
    if (sessionState === "starting_camera") {
      console.log("[Effect Hook 2 - Session Init] State is 'starting_camera'. Resetting photos and index.");
      setPhotos([]);
      setCurrentPhotoIndex(0);
      setQrCodeUrl("");
      setCameraError(null);
      setCountdown(0);
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, startCamera]);

  useEffect(() => {
    if (sessionState === "camera_ready") {
      console.log("[Effect Hook 3 - Camera Ready] Camera is ready. Calling proceedToNextStep to start photo sequence.");
      proceedToNextStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, proceedToNextStep]);

  useEffect(() => {
    console.log(`[Effect Hook 4 - API Call Check] sessionState: ${sessionState}, photos.length: ${photos.length}`);
    const completeAndCallApi = async () => {
      stopCamera();
      console.log("[Effect Hook 4 - API Call] Photos for API:", photos);
      const apiResult = await processPhotosAndGetQR(photos, selectedTemplate);
      if (apiResult) {
        setQrCodeUrl(apiResult.qrCodeUrl);
        setSessionState("finished");
      }
    };

    if (sessionState === "processing_server") {
      if (photos.length === TOTAL_PHOTOS) {
        console.log(`[Effect Hook 4 - 'processing_server'] Correct photo count (${photos.length}). Calling API.`);
        completeAndCallApi();
      } else {
        console.warn(
          `[Effect Hook 4 - 'processing_server'] Incorrect photo count. Needed: ${TOTAL_PHOTOS}, Have: ${photos.length}. API call aborted. This indicates an earlier issue.`
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, photos, selectedTemplate, stopCamera, processPhotosAndGetQR]);

  const handleStartPhotoSession = () => {
    console.log("[Session Trigger] handleStartPhotoSession called.");
    if (sessionState !== "idle" && sessionState !== "finished" && sessionState !== "error") {
      console.warn("[Session Trigger] Start aborted. Session state:", sessionState);
      return;
    }
    setSessionState("starting_camera");
  };

  const resetSession = useCallback(() => {
    console.log("[Session Trigger] resetSession called.");
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
    return () => {
      console.log("[Component Lifecycle] HomePage unmounting. Cleaning up.");
      stopCamera();
    };
  }, [stopCamera]);

  let statusText = "";
  if (sessionState === "starting_camera") statusText = "Menyalakan kamera...";
  else if (sessionState === "camera_ready") statusText = "Kamera siap! Memulai...";
  else if (sessionState === "countdown_to_capture")
    statusText = `Siap-siap Foto ${currentPhotoIndex + 1}... ${countdown}`;
  else if (sessionState === "capturing") statusText = `TERSENYUM! Foto ${currentPhotoIndex + 1}`;
  else if (sessionState === "inter_photo_countdown")
    statusText = `Foto ${currentPhotoIndex} selesai. Berikutnya: ${countdown}s`;
  else if (sessionState === "processing_server") statusText = "Memproses fotomu...";

  const primaryButtonClass =
    "bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300 ease-in-out transform hover:scale-105";
  const cardClass = "bg-white p-6 sm:p-8 rounded-xl shadow-2xl w-full";

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 selection:bg-blue-500 selection:text-white">
      <header className="mb-6 sm:mb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 mb-2">Photobox SIL GBIKT 2025!</h1>
        <p className="text-lg sm:text-xl text-gray-600">Abadikan momen spesialmu dengan penuh sukacita!</p>
      </header>

      <div className="w-full max-w-lg mx-auto">
        {(sessionState === "idle" || sessionState === "error" || sessionState === "finished") && !qrCodeUrl && (
          <main className={`${cardClass} space-y-6`}>
            {cameraError && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
                <p className="font-bold">Error</p>
                <p>{cameraError}</p>
              </div>
            )}
            <section id="template-selection">
              <h2 className="text-2xl font-semibold mb-4 text-center text-gray-700">Pilih Template Design:</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-2 border-2 rounded-lg cursor-pointer transition-all duration-200 ease-in-out transform hover:shadow-lg hover:-translate-y-1
                                ${
                                  selectedTemplate === template.id
                                    ? "border-blue-500 ring-2 ring-blue-500 shadow-xl"
                                    : "border-gray-300 hover:border-blue-400 bg-gray-50"
                                }`}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <img
                      src={template.previewUrl}
                      alt={template.name}
                      className="w-full h-20 sm:h-24 object-cover rounded-md mb-2 bg-gray-200"
                      onError={(e) => (e.target.src = "https://via.placeholder.com/150x100?text=Preview")}
                    />
                    <p className="text-xs sm:text-sm text-center font-medium text-gray-700">{template.name}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-center mt-4 text-gray-600">
                Dipilih:{" "}
                <span className="font-semibold text-gray-800">
                  {templates.find((t) => t.id === selectedTemplate)?.name}
                </span>
              </p>
            </section>

            <section id="start-button" className="text-center pt-4">
              <button
                onClick={handleStartPhotoSession}
                disabled={sessionState !== "idle" && sessionState !== "finished" && sessionState !== "error"}
                className={`${primaryButtonClass} text-lg w-full sm:w-auto disabled:opacity-60 disabled:transform-none disabled:bg-gray-400`}
              >
                Mulai Foto!
              </button>
            </section>
          </main>
        )}

        {(sessionState === "starting_camera" ||
          sessionState === "camera_ready" ||
          sessionState === "countdown_to_capture" ||
          sessionState === "capturing" ||
          sessionState === "inter_photo_countdown" ||
          sessionState === "processing_server") && (
          <section id="photo-session" className={`${cardClass} text-center space-y-4`}>
            {cameraError && sessionState !== "processing_server" ? (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
                <p className="font-bold">Error Kamera</p>
                <p>{cameraError}</p>
                <button
                  onClick={resetSession}
                  className="mt-3 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-md text-sm transition-colors duration-200"
                >
                  Coba Lagi
                </button>
              </div>
            ) : (
              <>
                {(sessionState !== "processing_server" || cameraError) && (
                  <div className="w-full aspect-[4/3] bg-gray-900 rounded-lg mb-2 overflow-hidden shadow-lg mx-auto max-w-md sm:max-w-none">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                    <canvas ref={canvasRef} className="hidden"></canvas>
                    {sessionState === "capturing" && (
                      <div className="absolute inset-0 bg-white opacity-75 animate-pulse"></div>
                    )}
                  </div>
                )}
                <p className="text-2xl sm:text-3xl font-bold text-gray-800 h-10">{statusText}</p>
                <p className="text-md text-gray-600">
                  {sessionState !== "processing_server" &&
                  sessionState !== "inter_photo_countdown" &&
                  sessionState !== "starting_camera" &&
                  sessionState !== "camera_ready" &&
                  currentPhotoIndex < TOTAL_PHOTOS
                    ? `Foto ${currentPhotoIndex + 1} dari ${TOTAL_PHOTOS}`
                    : sessionState === "inter_photo_countdown"
                    ? `Menunggu foto berikutnya...`
                    : sessionState !== "processing_server" &&
                      sessionState !== "starting_camera" &&
                      sessionState !== "camera_ready"
                    ? `Selesai ${TOTAL_PHOTOS} foto!`
                    : ""}
                </p>
                {sessionState !== "processing_server" && (
                  <button
                    onClick={resetSession}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-6 rounded-lg text-md shadow focus:outline-none focus:ring-2 focus:ring-gray-400 transition-all duration-300 ease-in-out"
                  >
                    Batalkan
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {sessionState === "finished" && qrCodeUrl && (
          <section id="qr-code-display" className={`${cardClass} text-center space-y-6`}>
            <h2 className="text-3xl font-semibold mb-2 text-gray-800">Foto Selesai!</h2>
            {cameraError && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded-md text-sm" role="alert">
                <p>{cameraError}</p>
              </div>
            )}
            <p className="text-gray-600">Scan QR code ini untuk melihat fotomu.</p>
            <div className="flex justify-center my-4">
              <img
                src={qrCodeUrl}
                alt="QR Code untuk fotomu"
                className="w-48 h-48 sm:w-60 sm:h-60 border-4 border-gray-200 rounded-lg shadow-md"
              />
            </div>
            {photos.length > 0 && (
              <div className="pt-2">
                <p className="text-sm text-gray-500 mb-2">Preview:</p>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photoSrc, index) => (
                    <img
                      key={index}
                      src={photoSrc}
                      alt={`Foto ${index + 1}`}
                      className="w-full h-auto rounded-md shadow-sm object-cover aspect-square bg-gray-200"
                    />
                  ))}
                </div>
              </div>
            )}
            <button onClick={resetSession} className={`${primaryButtonClass} w-full sm:w-auto`}>
              Ambil Foto Lagi
            </button>
          </section>
        )}
      </div>

      <footer className="mt-8 sm:mt-12 text-center py-4">
        <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} SIL GBIKT. All rights reserved.</p>
      </footer>
    </div>
  );
}
