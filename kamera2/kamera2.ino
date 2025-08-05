#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <SPI.h>
#include <SD.h>

// Access Point Konfiguration
const char* ap_ssid = "Geocache-Kamera";
const char* ap_password = ""; // Mindestens 8 Zeichen

// DNS Server für Captive Portal
const byte DNS_PORT = 53;
DNSServer dnsServer;

// WebServer auf Port 80
WebServer server(80);

// Kamerakonfiguration für AI-Thinker ESP32-CAM
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define LED_GPIO_NUM        4  // Flash LED

#define SD_CS 13
#define SD_MISO 2
#define SD_MOSI 15
#define SD_SCLK 14

// Globale Variablen
bool saveRequested = false;
camera_fb_t* last_fb = NULL;

void setup() {
  Serial.begin(115200);
  
  // Kamera initialisieren
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  SPI.begin(SD_SCLK, SD_MISO, SD_MOSI);
  if (!SD.begin(SD_CS, SPI, 80000000)) {
    Serial.println("SD-Karten-Montierung fehlgeschlagen");
  } else {
    Serial.println("SD-Karte initialisiert");
  }
  
  // Qualitätseinstellungen
  config.frame_size = FRAMESIZE_VGA;  // 640x480
  config.jpeg_quality = 15;           // 0-63 (niedriger = besser)
  config.fb_count = 2;

  // Kamera starten
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Kamera-Fehler 0x%x", err);
    return;
  }

  // LED-Pin konfigurieren
  pinMode(LED_GPIO_NUM, OUTPUT);
  digitalWrite(LED_GPIO_NUM, LOW);

  // Access Point starten
  WiFi.softAP(ap_ssid, ap_password);
  Serial.print("Access Point gestartet: ");
  Serial.println(ap_ssid);
  Serial.print("IP-Adresse: ");
  Serial.println(WiFi.softAPIP());

  // DNS Server für Captive Portal starten
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  // WebServer Routen
  server.on("/", HTTP_GET, handleRoot);
  server.on("/stream", HTTP_GET, handleStream);
  server.on("/save", HTTP_GET, handleSave);
   server.on("/control-flash", handleControlFlash);
  server.onNotFound(handleRoot);

  server.begin();
  Serial.println("HTTP Server gestartet");
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
  
  // Bild speichern, wenn angefragt
  if (saveRequested) {
    saveRequested = false;
    performSave();
  }
  
  // Altes Framebuffer freigeben
  if (last_fb) {
    esp_camera_fb_return(last_fb);
    last_fb = NULL;
  }
  
  // Neues Bild aufnehmen für Stream
  last_fb = esp_camera_fb_get();
}

void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gesichtserkennung für WLAN-Zugang</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            margin: 20px;
            padding: 10px;
        }
        #streamContainer {
            position: relative;
            margin: 0 auto;
            width: 100%;
            max-width: 640px;
        }
        #streamImage {
            background: #000;
            width: 100%;
            max-height: 60vh;
            display: block;
            margin: 10px auto;
        }
        #result {
            font-size: 24px;
            margin: 20px auto;
            padding: 15px;
            border-radius: 5px;
            max-width: 600px;
        }
        .face-detected {
            background-color: #8bc34a;
            color: white;
        }
        .no-face {
            background-color: #f44336;
            color: white;
        }
      .alert {
          background-color: #ff9800;
          color: black;
          padding: 1em;
          border-radius: 0; /* Entfernt die abgerundeten Ecken, da das Overlay den ganzen Bildschirm bedeckt */
          margin: 0; /* Entfernt alle Ränder */
          font-size: 18px;
          display: none;

          /* Overlay-spezifische Stile */
          position: fixed; /* Damit das Element relativ zum Viewport positioniert wird */
          top: 0; /* Setzt das Element ganz oben */
          left: 0; /* Setzt das Element ganz links */
          width: 100%; /* Vollständige Breite des Viewports */
          height: 100%; /* Vollständige Höhe des Viewports */
          z-index: 1000; /* Stellt sicher, dass das Overlay über anderen Inhalten liegt */
      }
        button {
            background-color: #4CAF50;
            border: none;
            color: white;
            padding: 15px 32px;
            font-size: 18px;
            margin: 10px 5px;
            cursor: pointer;
            border-radius: 5px;
            width: 100%;
            max-width: 300px;
        }
        #codeDisplay {
            font-size: 48px;
            font-weight: bold;
            margin: 20px;
            color: #2196F3;
            display: none;
        }
        .loading {
            border: 5px solid #f3f3f3;
            border-top: 5px solid #3498db;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 2s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .instructions {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin: 20px auto;
            max-width: 600px;
            text-align: left;
        }
                .switch {
            position: relative;
            display: inline-block;
            width: 60px;
            height: 34px;
        }
        
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 34px;
        }
        
        .slider:before {
            position: absolute;
            content: "";
            height: 26px;
            width: 26px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        
        input:checked + .slider {
            background-color: #2196F3;
        }
        
        input:checked + .slider:before {
            transform: translateX(26px);
        }
    </style>
</head>
<body>
    <h1>Selfie Kamera</h1>

    <!-- WebView-Warnung -->
    <div id="webviewAlert" class="alert">
        Browser wird nicht unterstützt.<br>
        Bitte öffnen Sie die Seite manuell unter:<br>
        <strong>http://192.168.4.1</strong>
    </div>

    <div class="instructions">
        <p>1. Halten Sie Ihr Gesicht(oder Hand) vor die Kamera</p>
        <p>2. Wenn ein Gesicht erkannt wird, klicken Sie auf "Bild aufnehmen"</p>
        <p>3. Sie erhalten den Code für den Cache</p>
    </div>

    <div id="streamContainer">
        <img id="streamImage" src="/stream" crossorigin="anonymous">
        <div id="loading" class="loading"></div>
    </div>

    <div id="result">Initialisiere Kamera-Stream...</div>
    <button id="captureBtn">Bild aufnehmen</button>
        <h1>Blitz</h1>
    <label class="switch">
        <input type="checkbox" id="flashToggle">
        <span class="slider"></span>
    </label>
    <p>Blitz: <span id="flashStatus">AUS</span></p>
    <div id="codeDisplay"></div>

    <script>
        // WebView-Erkennung
        function isAndroidWebView() {
            const ua = navigator.userAgent || '';
            const isAndroid = /Android/i.test(ua);
            const isWebView = (
                (isAndroid && /Version\/[\d.]+/.test(ua) && !/Chrome\/[\d.]+/.test(ua)) ||
                ua.includes("wv") || ua.includes("AndroidWebView")
            );
            return isAndroid && isWebView;
        }

        if (isAndroidWebView()) {
            document.getElementById("webviewAlert").style.display = "block";
        }

        // Elemente
        const streamImage = document.getElementById('streamImage');
        const result = document.getElementById('result');
        const captureBtn = document.getElementById('captureBtn');
        const codeDisplay = document.getElementById('codeDisplay');
        const loadingIndicator = document.getElementById('loading');

        const REFRESH_RATE = 50;
        const SKIN_THRESHOLD = 5;
        const CAPTURE_COOLDOWN = 2000;
        const REDIRECT_URL = 'http://example.com/portal';

        let faceDetected = false;
        let codeShown = false;
        let lastCaptureTime = 0;

        function init() {
            startStreamRefresh();
            setupEventHandlers();
        }

        function startStreamRefresh() {
            setInterval(() => {
                streamImage.src = '/stream?' + new Date().getTime();
            }, REFRESH_RATE);
        }

        function setupEventHandlers() {
            streamImage.onload = handleStreamLoad;
            streamImage.onerror = handleStreamError;
            captureBtn.addEventListener('click', handleCapture);
        }

        function handleStreamLoad() {
            loadingIndicator.style.display = "none";
            analyzeImage();
        }

        function handleStreamError() {
            showError("Fehler beim Laden des Kamera-Streams");
            loadingIndicator.style.display = "none";
        }

        function analyzeImage() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            try {
                canvas.width = streamImage.naturalWidth;
                canvas.height = streamImage.naturalHeight;
                ctx.drawImage(streamImage, 0, 0);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const skinPercentage = calculateSkinPercentage(imageData);
                faceDetected = skinPercentage > SKIN_THRESHOLD;
                updateDetectionResult(skinPercentage);
            } catch (e) {
                console.error("Analysefehler:", e);
            }
        }

        function calculateSkinPercentage(imageData) {
            let skinPixels = 0;
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const [h, s, v] = rgbToHsv(data[i], data[i+1], data[i+2]);
                if (isSkinColor(h, s, v)) skinPixels++;
            }
            return (skinPixels / (data.length / 4)) * 100;
        }

        function updateDetectionResult(skinPercentage) {
            if (faceDetected) {
                showSuccess(`Gesicht erkannt! (${skinPercentage.toFixed(1)}% Hauttöne)`);
            } else {
                showError(`Kein Gesicht erkannt (${skinPercentage.toFixed(1)}% Hauttöne)`);
            }
        }

        function handleCapture() {
            const now = Date.now();
            if (now - lastCaptureTime < CAPTURE_COOLDOWN) {
                const remaining = Math.ceil((CAPTURE_COOLDOWN - (now - lastCaptureTime)) / 1000);
                showError(`Bitte warten Sie ${remaining} Sekunde(n)`);
                return;
            }

            lastCaptureTime = now;
            processCapture();
        }

        function processCapture() {
            loadingIndicator.style.display = "block";
            const downloadImg = new Image();
            downloadImg.crossOrigin = "anonymous";
            downloadImg.src = '/stream?' + new Date().getTime();
            downloadImg.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = downloadImg.naturalWidth;
                canvas.height = downloadImg.naturalHeight;
                ctx.drawImage(downloadImg, 0, 0);
                addTextToImage(ctx, canvas.width, canvas.height);
                downloadImage(canvas);
                if (faceDetected && !codeShown) {
                    showCode();
                }
                loadingIndicator.style.display = "none";
            };
            downloadImg.onerror = function() {
                showError("Fehler beim Laden des Bildes");
                loadingIndicator.style.display = "none";
            };
        }

        function addTextToImage(ctx, width, height) {
            ctx.font = "30px Arial";
            ctx.fillStyle = "#FFFFFF";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = 2;
            ctx.textAlign = "center";
            const text = faceDetected ? "Gratulation! ich habe GC1234 geschaft." : "Mache ein Selfie!";
            ctx.strokeText(text, width/2, 50);
            ctx.fillText(text, width/2, 50);
        }

        function downloadImage(canvas) {
            const link = document.createElement('a');
            link.download = 'wlan-access-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            fetch('/save')
        }

        function showCode() {
            codeDisplay.textContent = "1234";
            codeDisplay.style.display = "block";
            codeShown = true;
        }

        function rgbToHsv(r, g, b) {
            r /= 255, g /= 255, b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            let h, s = max === 0 ? 0 : (max - min) / max;
            const v = max;
            if (max === min) h = 0;
            else {
                switch(max) {
                    case r: h = (g - b) / (max - min) + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / (max - min) + 2; break;
                    case b: h = (r - g) / (max - min) + 4; break;
                }
                h /= 6;
            }
            return [h * 360, s * 255, v * 255];
        }

        function isSkinColor(h, s, v) {
            return h >= 0 && h <= 50 && s >= 20 && s <= 255 && v >= 40 && v <= 255;
        }

        function showSuccess(message) {
            result.textContent = message;
            result.className = "face-detected";
        }

        function showError(message) {
            result.textContent = message;
            result.className = "no-face";
        }

        init();
                document.getElementById('flashToggle').addEventListener('change', function() {
            const flashState = this.checked ? 'on' : 'off';
            document.getElementById('flashStatus').textContent = this.checked ? 'EIN' : 'AUS';
            
            fetch('/control-flash', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'state=' + flashState
            })
            .then(response => response.text())
            .then(data => console.log(data))
            .catch(error => console.error('Error:', error));
        });
    </script>
</body>
</html>


  )rawliteral";

  server.send(200, "text/html", html);
}

// Geänderter Videostream Handler
void handleStream() {
  WiFiClient client = server.client();
  
  if (!last_fb) {
    server.send(503, "text/plain", "Kein Bild verfügbar");
    return;
  }
  
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: image/jpeg");
  client.println("Content-Length: " + String(last_fb->len));
  client.println("Connection: close");
  client.println();
  client.write((const char *)last_fb->buf, last_fb->len);
}

void handleSave() {
  saveRequested = true;
  server.send(200, "text/plain", "Speichervorgang eingeleitet");
}
void handleControlFlash() {
    if (server.method() == HTTP_POST) {
        String state = server.arg("state");
        if (state == "on") {
            digitalWrite(LED_GPIO_NUM, HIGH);
            server.send(200, "text/plain", "Flash ON");
        } else {
            digitalWrite(LED_GPIO_NUM, LOW);
            server.send(200, "text/plain", "Flash OFF");
        }
    }
}
void performSave() {
  if (!last_fb) {
    Serial.println("Kein Bild zum Speichern verfügbar");
    return;
  }

  // Dateinamen mit Zeitstempel generieren
  char filename[30];
  sprintf(filename, "/selfie_%d.jpg", (int)millis());

  // Bild auf SD speichern
  File file = SD.open(filename, FILE_WRITE);
  if (file) {
    file.write(last_fb->buf, last_fb->len);
    file.close();
    Serial.println("Bild gespeichert: " + String(filename));
  } else {
    Serial.println("Fehler beim Speichern auf SD-Karte");
  }
}
