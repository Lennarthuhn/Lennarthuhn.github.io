#include <M5Unified.h>

#define GRID_WIDTH 8
#define GRID_HEIGHT 12
#define BLOCK_SIZE 23
#define PLAYFIELD_X 20
#define PLAYFIELD_Y 40

int grid[GRID_HEIGHT][GRID_WIDTH] = {0};
int lineCount = 0;
int prevLineCount = -1;

// Tetromino-Definitionen (7 Typen)
const uint8_t tetrominoes[7][4][4] = {
  // I
  {{0, 0, 0, 0},
    {1, 1, 1, 1},
    {0, 0, 0, 0},
    {0, 0, 0, 0}},
  // J
  {{1, 0, 0, 0},
    {1, 1, 1, 0},
    {0, 0, 0, 0},
    {0, 0, 0, 0}},
  // L
  {{0, 0, 1, 0},
    {1, 1, 1, 0},
    {0, 0, 0, 0},
    {0, 0, 0, 0}},
  // O
  {{1, 1, 0, 0},
    {1, 1, 0, 0},
    {0, 0, 0, 0},
    {0, 0, 0, 0}},
  // S
  {{0, 1, 1, 0},
    {1, 1, 0, 0},
    {0, 0, 0, 0},
    {0, 0, 0, 0}},
  // T
  {{0, 1, 0, 0},
    {1, 1, 1, 0},
    {0, 0, 0, 0},
    {0, 0, 0, 0}},
  // Z
  {{1, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 0, 0},
    {0, 0, 0, 0}}
};

int currentTetromino[4][4];
int tetrominoX, tetrominoY;
int currentType;

// Farbcodes für Tetrominos
const uint16_t tetrominoColors[7] = {
  TFT_CYAN,    // I
  TFT_BLUE,    // J
  TFT_ORANGE,  // L
  TFT_YELLOW,  // O
  TFT_GREEN,   // S
  TFT_MAGENTA, // T
  TFT_RED      // Z
};

void drawGrid() {
  M5.Lcd.fillRect(PLAYFIELD_X, PLAYFIELD_Y, 
                 GRID_WIDTH * BLOCK_SIZE, 
                 GRID_HEIGHT * BLOCK_SIZE, 
                 TFT_BLACK);
  
  // Gelegte Blöcke zeichnen
  for (int y = 0; y < GRID_HEIGHT; y++) {
    for (int x = 0; x < GRID_WIDTH; x++) {
      if (grid[y][x]) {
        M5.Lcd.fillRect(PLAYFIELD_X + x * BLOCK_SIZE, 
                       PLAYFIELD_Y + y * BLOCK_SIZE, 
                       BLOCK_SIZE, BLOCK_SIZE, 
                       tetrominoColors[grid[y][x]-1]); // Farbe basierend auf Typ
      }
    }
  }
  
  // Aktuelles Tetromino zeichnen
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      if (currentTetromino[y][x]) {
        int screenX = PLAYFIELD_X + (tetrominoX + x) * BLOCK_SIZE;
        int screenY = PLAYFIELD_Y + (tetrominoY + y) * BLOCK_SIZE;
        if (screenY >= PLAYFIELD_Y) {
          M5.Lcd.fillRect(screenX, screenY, 
                         BLOCK_SIZE, BLOCK_SIZE, 
                         tetrominoColors[currentType]);
        }
      }
    }
  }
}

void updateLineCounter() {
  if (lineCount != prevLineCount) {
    prevLineCount = lineCount;
    // Hintergrundbereich löschen
    M5.Lcd.fillRect(200, 0, 40, 15, TFT_BLACK);
    // Unauffälliger Linienzähler
    M5.Lcd.setTextColor(TFT_LIGHTGREY);
    M5.Lcd.setTextSize(2);
    M5.Lcd.setCursor(120, 5);
    M5.Lcd.fillRect(120, 0, 200, 20, TFT_BLACK); // x=220, y=0, breite=20, höhe=20
    M5.Lcd.print(String(lineCount) + " von 4 L.");
            if (lineCount == 4){
    M5.Lcd.fillRect(20, 60, 280, 120, BLUE); // Popup-Hintergrund
    M5.Lcd.drawRect(20, 60, 280, 120, WHITE); // Weißer Rahmen

    M5.Lcd.setTextColor(WHITE);
    M5.Lcd.setTextSize(1.5);
    M5.Lcd.setCursor(40, 80);
    M5.Lcd.print("Gratulation!");

    M5.Lcd.setCursor(40, 110);
    M5.Lcd.print("Code zum Öffnen:");

    M5.Lcd.setTextColor(YELLOW);
    M5.Lcd.setTextSize(3);
    M5.Lcd.setCursor(90, 140);
    M5.Lcd.print("2, 11, 6");

    delay(10000); // 10 Sekunden anzeigen
            }
  }
}

bool checkCollision(int offsetX, int offsetY) {
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      if (currentTetromino[y][x]) {
        int newX = tetrominoX + x + offsetX;
        int newY = tetrominoY + y + offsetY;
        
        if (newX < 0 || newX >= GRID_WIDTH || newY >= GRID_HEIGHT) {
          return true;
        }
        
        if (newY >= 0 && grid[newY][newX]) {
          return true;
        }
      }
    }
  }
  return false;
}

void rotateTetromino() {
  int temp[4][4];
  memcpy(temp, currentTetromino, sizeof(temp));
  
  // 90° Rotation
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      currentTetromino[x][3 - y] = temp[y][x];
    }
  }
  
  if (checkCollision(0, 0)) {
    memcpy(currentTetromino, temp, sizeof(temp));
  }
}

void spawnTetromino() {
  currentType = random(7);
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      currentTetromino[y][x] = tetrominoes[currentType][y][x];
    }
  }
  tetrominoX = GRID_WIDTH / 2 - 2;
  tetrominoY = 0;
}

void setup() {
  M5.begin();
  M5.Lcd.setRotation(2); // Hochformat (240x320)
  M5.Lcd.fillScreen(TFT_BLACK);
  
  // Tetris-Schrift oben links
  M5.Lcd.setTextColor(TFT_WHITE);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setCursor(5, 5);
  M5.Lcd.print("TETRIS");
  
  randomSeed(millis());
  spawnTetromino();
  
  // Initialen Linienzähler anzeigen
  updateLineCounter();
}

void loop() {
  M5.update();
  
  // Steuerung
  if (M5.BtnA.wasPressed() && !checkCollision(-1, 0)) {
    tetrominoX--;
  }
  if (M5.BtnB.wasPressed() && !checkCollision(1, 0)) {
    tetrominoX++;
  }
  if (M5.BtnC.wasPressed()) {
    rotateTetromino();
  }
  
  // Automatisches Herunterfallen
  static unsigned long lastFall = 0;
  if (millis() - lastFall > 500) {
    lastFall = millis();
    
    if (!checkCollision(0, 1)) {
      tetrominoY++;
    } else {
      // Tetromino fixieren
      for (int y = 0; y < 4; y++) {
        for (int x = 0; x < 4; x++) {
          if (currentTetromino[y][x]) {
            int gridX = tetrominoX + x;
            int gridY = tetrominoY + y;
            if (gridY >= 0) {
              grid[gridY][gridX] = currentType + 1; // Typ speichern (1-7)
            }
          }
        }
      }
      
      // Linien prüfen und löschen
      for (int y = GRID_HEIGHT - 1; y >= 0; y--) {
        bool lineFull = true;
        for (int x = 0; x < GRID_WIDTH; x++) {
          if (grid[y][x] == 0) {
            lineFull = false;
            break;
          }
        }
        
        if (lineFull) {
          lineCount++;
          // Linien nach unten verschieben
          for (int yy = y; yy > 0; yy--) {
            for (int x = 0; x < GRID_WIDTH; x++) {
              grid[yy][x] = grid[yy - 1][x];
            }
          }
          // Obere Linie löschen
          for (int x = 0; x < GRID_WIDTH; x++) {
            grid[0][x] = 0;
          }
          y++; // Gleiche Linie erneut prüfen
        }
      }
      
      spawnTetromino();
    }
  }
  
  updateLineCounter();
  drawGrid();
  delay(70);
}