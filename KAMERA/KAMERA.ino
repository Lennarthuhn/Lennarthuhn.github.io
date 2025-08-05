#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>

// Access Point Konfiguration
const char* ap_ssid = "ESP32-CAM";
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

  server.on("/capture", HTTP_GET, handleCapture); // Neuer Download-Endpunkt
  server.onNotFound(handleRoot); // Alle Anfragen auf Root umleiten

  server.begin();
  Serial.println("HTTP Server gestartet");
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
  
}

// HTML-Seite mit eingebettetem Videostream und Download-Button
void handleRoot() {
  String html = R"rawliteral(
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>ESP32-CAM Selfie</title>
    <style>
      body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }
      h1 { color: #2f4468; }
      button { 
        background-color: #4CAF50; 
        border: none; 
        color: white; 
        padding: 12px 24px; 
        text-align: center; 
        text-decoration: none; 
        display: inline-block; 
        font-size: 16px; 
        margin: 10px 2px; 
        cursor: pointer; 
        border-radius: 8px;
      }
      .btn-download {
        background-color: #2196F3;
      }
      .container { 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
      }
      #stream-container { 
        margin: 20px 0; 
        max-width: 640px; 
        border: 3px solid #2f4468; 
        border-radius: 10px; 
        overflow: hidden; 
        position: relative;
      }
      img { width: 100%; }
      .snapshot-indicator {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 5px 10px;
        border-radius: 5px;
        display: none;
      }
      #face-status {
        margin: 15px 0;
        padding: 15px;
        border-radius: 8px;
        font-weight: bold;
        font-size: 18px;
        max-width: 500px;
      }
      .face-detected {
        background-color: #d4edda;
        color: #155724;
        border: 2px solid #c3e6cb;
      }
      .no-face {
        background-color: #f8d7da;
        color: #721c24;
        border: 2px solid #f5c6cb;
      }
      .code-display {
        font-family: monospace;
        font-size: 24px;
        letter-spacing: 3px;
        margin: 10px 0;
        padding: 10px;
        background: #333;
        color: #0f0;
        border-radius: 5px;
        display: inline-block;
      }
      #code-result {
        display: none;
        margin: 20px 0;
        padding: 20px;
        background: #e8f4e8;
        border-radius: 10px;
        border: 2px solid #4CAF50;
      }
      #loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>ESP32-CAM Selfie System</h1>
      
      <div id="face-status" class="no-face">
        🔍 Suche nach Gesicht...
      </div>
      
      <div id="stream-container">
        <img id="stream" src="/stream" alt="Live Stream">
        <div id="snapshot-indicator" class="snapshot-indicator">Bild gespeichert!</div>
        <div id="loading">Lade Gesichtserkennung...</div>
      </div>
      
      <div>

        <button class="btn-download" onclick="captureImage()">Selfie aufnehmen</button>
      </div>
      
      
      <div id="code-result">
        <h2>Erfolgreich erkannt!</h2>
        <p>Dein Zugangscode lautet:</p>
        <div class="code-display">1234</div>
        <p>Notiere diesen Code für den Zugang</p>
      </div>
      
      <p>Verbunden mit: )rawliteral";
  html += ap_ssid;
  html += R"rawliteral(</p>
    </div>
    
    <script>
      // Gesichtserkennungs-Modell
      const faceDetectionModel = {
        detect: function(image) {
          // Einfache Gesichtserkennung basierend auf Hautton
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = image.width;
          canvas.height = image.height;
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          let skinPixels = 0;
          
          for (let y = 0; y < canvas.height; y += 10) {
            for (let x = 0; x < canvas.width; x += 10) {
              const i = (y * canvas.width + x) * 4;
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              
              // Hautton-Erkennung
              if (r > 100 && g > 50 && b > 50 && r > g && r > b && 
                  Math.abs(r - g) > 20 && r - b > 20) {
                skinPixels++;
              }
            }
          }
          
          // Mindestens 3% der Pixel müssen Hautton sein
          const skinRatio = skinPixels / ((canvas.width/10) * (canvas.height/10));
          return skinRatio > 0.03;
        }
      };

      // Initialisierung
      document.addEventListener('DOMContentLoaded', function() {
        // "Lade"-Anzeige ausblenden
        setTimeout(() => {
          document.getElementById('loading').style.display = 'none';
        }, 2000);
        
        // Periodische Gesichtserkennung im Stream
        setInterval(detectFaceInStream, 1000);
      });

      // Gesichtserkennung im Live-Stream
      function detectFaceInStream() {
        const imgElement = document.getElementById('stream');
        if (!imgElement.complete || imgElement.naturalWidth === 0) return;
        
        const faceDetected = faceDetectionModel.detect(imgElement);
        const statusElement = document.getElementById('face-status');
        
        if (faceDetected) {
          statusElement.innerHTML = "✅ Gesicht erkannt! Bereit für Selfie";
          statusElement.className = "face-detected";
        } else {
          statusElement.innerHTML = "⏳ Kein Gesicht erkannt - bitte positionieren";
          statusElement.className = "no-face";
        }
      }


      
      function captureImage() {
        const imgElement = document.getElementById('stream');
        const indicator = document.getElementById('snapshot-indicator');
        const statusElement = document.getElementById('face-status');
        const codeResult = document.getElementById('code-result');
        const faceDetected = faceDetectionModel.detect(imgElement);
        
        // Temporäres Canvas erstellen
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Canvas auf Bildgröße setzen
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        
        // Bild auf Canvas zeichnen
        context.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
        
        // Text basierend auf Erkennung setzen
        const statusText = faceDetected ? "Gratulation" : "Mache ein Selfie";
        
        // Nur Text auf das Bild schreiben, wenn ein Gesicht erkannt wurde
        if (faceDetected) {
          context.font = 'bold 40px Arial';
          context.fillStyle = 'white';
          context.strokeStyle = 'black';
          context.lineWidth = 4;
          context.textAlign = 'center';
          
          // Textposition (zentriert)
          const x = canvas.width / 2;
          const y = canvas.height / 2;
          
          // Text mit Umriss zeichnen
          context.strokeText(statusText, x, y);
          context.fillText(statusText, x, y);
        }
        
        // Download-Link erstellen
        const link = document.createElement('a');
        link.download = 'selfie-' + new Date().toISOString().replace(/[:.]/g, '-') + '.jpg';
        link.href = canvas.toDataURL('image/jpeg');
        link.click();
        
        // Bestätigungsanimation anzeigen
        indicator.style.display = 'block';
        setTimeout(() => {
          indicator.style.display = 'none';
        }, 2000);
        
        // Status und Code-Anzeige aktualisieren
        if (faceDetected) {
          statusElement.innerHTML = "📸 Selfie gespeichert! Code freigegeben";
          codeResult.style.display = "block";
        } else {
          statusElement.innerHTML = "📸 Selfie gespeichert - kein Gesicht erkannt";
          codeResult.style.display = "none";
        }
      }
    </script>
  </body>
  </html>
  )rawliteral";

  server.send(200, "text/html", html);
}
// Videostream Handler
void handleStream() {
  WiFiClient client = server.client();
  
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
  client.println();
  
  while (client.connected()) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Bilderfassung fehlgeschlagen");
      continue;
    }
    
    client.print("--frame\r\n");
    client.print("Content-Type: image/jpeg\r\n\r\n");
    client.write(fb->buf, fb->len);
    client.print("\r\n");
    
    esp_camera_fb_return(fb);
    delay(30); // Framerate anpassen
  }
}



// Bilddownload Handler (NEU)
void handleCapture() {
  // Bild aufnehmen
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "text/plain", "Bilderfassung fehlgeschlagen");
    return;
  }

  // Zeitstempel für Dateinamen
  char filename[50];
  snprintf(filename, sizeof(filename), "esp32-cam-%lu.jpg", millis());
  
  // HTTP-Header für Download
  server.sendHeader("Content-Type", "image/jpeg");
  server.sendHeader("Content-Disposition", "attachment; filename=" + String(filename));
  server.sendHeader("Connection", "close");
  
  // Bild senden
  server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);
  
  // Ressourcen freigeben
  esp_camera_fb_return(fb);
}