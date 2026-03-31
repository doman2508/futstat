import { createWorker, PSM } from "tesseract.js";

export type SummaryOcrSuggestion = {
  rawText: string;
  score?: {
    left: string;
    right: string;
  };
  teamStats: Record<string, string>;
  opponentStats: Record<string, string>;
};

export type PlayerOcrSuggestion = {
  name: string;
  rating: string;
  goals: string;
  assists: string;
};

export type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SummaryCropSettings = {
  score: CropBox;
  stats: CropBox;
};

type OcrMode = "summary-score" | "summary-stats" | "players";

const summaryPatterns: { key: string; aliases: string[] }[] = [
  { key: "possession", aliases: ["posiadanie pilki"] },
  { key: "shots", aliases: ["strzaly"] },
  { key: "expectedGoals", aliases: ["oczekiwane bramki"] },
  { key: "passes", aliases: ["podania"] },
  { key: "tackles", aliases: ["odbiory"] },
  { key: "successfulTackles", aliases: ["udane odbiory"] },
  { key: "interceptions", aliases: ["przechwyty"] },
  { key: "saves", aliases: ["obrony"] },
  { key: "fouls", aliases: ["popelnione faule"] },
  { key: "offsides", aliases: ["spalone"] },
  { key: "corners", aliases: ["rzuty rozne"] },
  { key: "freeKicks", aliases: ["rzuty wolne"] },
  { key: "yellowCards", aliases: ["zolte kartki"] }
];

function normalizeOcrText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, " ")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeOcrLine(line: string) {
  return normalizeOcrText(line)
    .replace(/[^\w\s:.,%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nie udalo sie zaladowac obrazu."));
    image.src = dataUrl;
  });
}

function cropArea(
  source: HTMLImageElement,
  xRatio: number,
  yRatio: number,
  widthRatio: number,
  heightRatio: number
) {
  const sx = source.width * xRatio;
  const sy = source.height * yRatio;
  const sw = source.width * widthRatio;
  const sh = source.height * heightRatio;
  const scale = 2;
  const canvas = createCanvas(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Nie udalo sie przygotowac obrazu do OCR.");
  }

  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function enhanceCanvas(canvas: HTMLCanvasElement, threshold: number) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Nie udalo sie poprawic obrazu.");
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrast = gray > threshold ? 255 : 0;
    data[index] = contrast;
    data[index + 1] = contrast;
    data[index + 2] = contrast;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function recognizeWithConfig(
  dataUrl: string,
  mode: OcrMode,
  whitelist?: string
) {
  const worker = await createWorker("eng");

  try {
    if (mode === "summary-score") {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: whitelist ?? "0123456789:-"
      });
    } else if (mode === "players") {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK
      });
    } else {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK
      });
    }

    const result = await worker.recognize(dataUrl);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

export async function recognizeSummaryScreenshot(
  dataUrl: string,
  cropSettings?: SummaryCropSettings
) {
  const source = await loadImage(dataUrl);
  const scoreCrop = cropSettings?.score ?? { x: 0.26, y: 0.02, width: 0.48, height: 0.16 };
  const statsCrop = cropSettings?.stats ?? { x: 0.17, y: 0.16, width: 0.66, height: 0.58 };
  const scoreCanvas = cropArea(source, scoreCrop.x, scoreCrop.y, scoreCrop.width, scoreCrop.height);
  const statsCanvas = cropArea(source, statsCrop.x, statsCrop.y, statsCrop.width, statsCrop.height);

  const scoreImage = enhanceCanvas(scoreCanvas, 145);
  const statsImage = enhanceCanvas(statsCanvas, 165);

  const [scoreText, statsText] = await Promise.all([
    recognizeWithConfig(scoreImage, "summary-score", "0123456789:-"),
    recognizeWithConfig(statsImage, "summary-stats")
  ]);

  return {
    scoreText,
    statsText,
    combinedText: `${scoreText}\n${statsText}`.trim()
  };
}

export async function recognizePlayersScreenshot(dataUrl: string, cropBox?: CropBox) {
  const source = await loadImage(dataUrl);
  const playersCrop = cropBox ?? { x: 0.02, y: 0.12, width: 0.42, height: 0.76 };
  const playersCanvas = cropArea(
    source,
    playersCrop.x,
    playersCrop.y,
    playersCrop.width,
    playersCrop.height
  );
  const playersImage = enhanceCanvas(playersCanvas, 170);

  return recognizeWithConfig(playersImage, "players");
}

function extractScore(text: string) {
  const normalized = normalizeOcrText(text)
    .replace(/\b92[:.]?\d+\b/g, " ")
    .replace(/\b\d{2}[:.]\d{2}\b/g, " ");

  const direct = normalized.match(/(\d{1,2})\s*[:\-]\s*(\d{1,2})/);
  if (direct) {
    const left = direct[1];
    const right = direct[2];

    if (left && right) {
      return { left, right };
    }
  }

  const standaloneNumbers = normalized.match(/\b\d{1,2}\b/g) ?? [];
  if (standaloneNumbers.length >= 2) {
    return {
      left: standaloneNumbers[0] ?? "0",
      right: standaloneNumbers[1]
    };
  }

  return undefined;
}

function extractTwoValuesFromLine(line: string, alias: string) {
  const aliasIndex = line.indexOf(alias);
  if (aliasIndex === -1) {
    return null;
  }

  const numbers = line.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numbers.length < 2) {
    return null;
  }

  return {
    left: (numbers[0] ?? "0").replace(",", "."),
    right: (numbers[numbers.length - 1] ?? "0").replace(",", ".")
  };
}

export function parseSummaryOcr(text: string): SummaryOcrSuggestion {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeOcrLine)
    .filter(Boolean);

  const teamStats: Record<string, string> = {};
  const opponentStats: Record<string, string> = {};

  for (const line of lines) {
    for (const pattern of summaryPatterns) {
      const matchedAlias = pattern.aliases.find((alias) => line.includes(alias));
      if (!matchedAlias) {
        continue;
      }

      const values = extractTwoValuesFromLine(line, matchedAlias);
      if (!values) {
        continue;
      }

      teamStats[pattern.key] = values.left;
      opponentStats[pattern.key] = values.right;
    }
  }

  return {
    rawText: text,
    score: extractScore(text),
    teamStats,
    opponentStats
  };
}

export function parsePlayersOcr(text: string): PlayerOcrSuggestion[] {
  return text
    .split(/\r?\n/)
    .map(normalizeOcrLine)
    .filter(Boolean)
    .map((line) => {
      const compact = line.replace(/\s+/g, " ").trim();
      const match = compact.match(
        /([a-zà-ÿ.'-]{2,}(?:\s+[a-zà-ÿ.'-]{2,}){0,2})\s+(\d[.,]\d)(?:\s+(\d+))?(?:\s+(\d+))?/i
      );

      if (!match) {
        return null;
      }

      const name = match[1]
        .split(" ")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join(" ")
        .trim();

      if (name.length < 3) {
        return null;
      }

      return {
        name,
        rating: match[2].replace(",", "."),
        goals: match[3] ?? "0",
        assists: match[4] ?? "0"
      };
    })
    .filter((entry): entry is PlayerOcrSuggestion => entry !== null)
    .slice(0, 11);
}
